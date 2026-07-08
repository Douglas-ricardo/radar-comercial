# app/api/files.py
import logging
import os
import uuid
import magic
from pathlib import Path

from fastapi import APIRouter, UploadFile, HTTPException, Depends, Query
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import update

from app.infrastructure.database import get_db_session
from app.infrastructure import storage
from app.domain.models import UploadedFile, AnalysisResult, Company
from app.core.auth import get_current_user_and_company, require_upload_permission
from app.services.plan_service import PlanService
from app.workers.tasks import process_sales_file

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/files", tags=["Files"])

# Limite de upload — configurável via MAX_UPLOAD_MB (default 500).
# Aumentar sem redimensionar o worker pode causar OOM; veja ETL lazy em etl.py.
_MAX_UPLOAD_MB = int(os.getenv("MAX_UPLOAD_MB", "500"))
MAX_FILE_SIZE = _MAX_UPLOAD_MB * 1024 * 1024


def _upload_mime_allowed(suffix: str, mime: str) -> bool:
    """
    Valida MIME em conjunto com a extensão.
    libmagic no Windows costuma devolver text/plain para CSV — por isso
    aceitamos ambos para CSV em vez de bloquear por MIME isolado.
    """
    if suffix == "csv":
        return mime in ("text/csv", "text/plain", "application/csv")
    if suffix == "xlsx":
        return mime in (
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/zip",
            "application/octet-stream",
        )
    if suffix == "xls":
        return mime in ("application/vnd.ms-excel", "application/octet-stream")
    return False


_TEMP_DIR = Path(os.getenv("TEMP_DIR", str(Path(__file__).resolve().parent.parent.parent / "temp")))
_TEMP_DIR.mkdir(parents=True, exist_ok=True)


def _refund_upload(db: Session, file_id: str, company_id: str) -> None:
    """
    Estorna o débito de cota e remove o registo do upload após uma falha que
    ocorre DEPOIS do incremento atómico de `uploads_used`. Sem isto, um erro do
    servidor (storage indisponível, broker fora, etc.) queimaria 1 da cota do
    plano do usuário sem processar nada.
    """
    db.query(UploadedFile).filter(UploadedFile.id == file_id).delete()
    db.execute(
        update(Company)
        .where(Company.id == company_id)
        .values(uploads_used=Company.uploads_used - 1)
    )
    db.commit()


@router.post("/upload")
async def upload_file(
    file: UploadFile,
    force: bool = Query(default=False, description="Substituir a base mesmo se o guard de mudança disparar (confirmação do usuário)."),
    token_data=Depends(require_upload_permission),
    db: Session = Depends(get_db_session),
):
    company_id = token_data.company_id

    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Empresa não encontrada.")

    PlanService.check_upload_limit(company)

    if not file.filename:
        raise HTTPException(status_code=400, detail="Nome de arquivo obrigatório.")
    safe_filename = Path(file.filename).name
    if not safe_filename:
        raise HTTPException(status_code=400, detail="Nome de arquivo inválido.")

    suffix = safe_filename.rsplit(".", 1)[-1].lower() if "." in safe_filename else ""
    if suffix not in ("csv", "xlsx", "xls"):
        raise HTTPException(
            status_code=400,
            detail="Extensão não suportada. Envie um ficheiro .csv, .xlsx ou .xls.",
        )

    header = await file.read(2048)
    await file.seek(0)

    file_mime = magic.from_buffer(header, mime=True)
    if not _upload_mime_allowed(suffix, file_mime):
        raise HTTPException(
            status_code=400,
            detail=f"Formato inválido para .{suffix}: {file_mime}",
        )

    file_id = str(uuid.uuid4())
    local_file_path = str(_TEMP_DIR / f"{file_id}_{safe_filename}")

    new_file = UploadedFile(
        id=file_id,
        company_id=company_id,
        filename=safe_filename,
        status="processing",
    )
    db.add(new_file)

    # UPDATE atômico com condição — previne race condition em uploads simultâneos.
    # Se dois requests chegarem ao mesmo tempo, apenas um consegue incrementar.
    stmt = (
        update(Company)
        .where(
            Company.id == company_id,
            Company.uploads_used < Company.uploads_limit,
        )
        .values(uploads_used=Company.uploads_used + 1)
    )
    result = db.execute(stmt)
    if result.rowcount == 0:
        db.rollback()
        raise HTTPException(
            status_code=403,
            detail="Limite de uploads atingido durante processamento simultâneo.",
        )

    db.commit()
    db.refresh(company)

    # Stream em chunks com validação de tamanho — evita carregar 500 MB na RAM.
    chunk_size = 1024 * 1024  # 1 MB
    total_bytes = 0
    try:
        with open(local_file_path, "wb") as buffer:
            while True:
                chunk = await file.read(chunk_size)
                if not chunk:
                    break
                total_bytes += len(chunk)
                if total_bytes > MAX_FILE_SIZE:
                    buffer.close()
                    if os.path.exists(local_file_path):
                        os.remove(local_file_path)
                    # Reverte o incremento de uploads_used e remove o registo
                    db.query(UploadedFile).filter(UploadedFile.id == file_id).delete()
                    db.execute(
                        update(Company)
                        .where(Company.id == company_id)
                        .values(uploads_used=Company.uploads_used - 1)
                    )
                    db.commit()
                    raise HTTPException(
                        status_code=413,
                        detail=f"Arquivo muito grande. Limite: {_MAX_UPLOAD_MB} MB.",
                    )
                buffer.write(chunk)
    except HTTPException:
        raise
    except Exception as exc:
        # Falha de I/O — reverte tudo
        if os.path.exists(local_file_path):
            os.remove(local_file_path)
        _refund_upload(db, file_id, company_id)
        logger.error("file.upload.write_error", extra={"file_id": file_id, "error": str(exc)})
        raise HTTPException(status_code=500, detail="Erro ao salvar o arquivo.")

    # Cauda do upload: log + promoção ao object storage + enfileiramento. A cota já
    # foi debitada atomicamente acima, então QUALQUER exceção inesperada daqui pra
    # frente precisa estornar `uploads_used` e devolver JSON padrão — nunca um 500
    # cru (que queimaria a cota do usuário por um erro do servidor).
    #
    # NOTA: a chave do log é `upload_filename`, não `filename`. `filename` é um
    # atributo RESERVADO do LogRecord do Python e dispara KeyError determinístico.
    try:
        logger.info(
            "file.upload.queued",
            extra={
                "file_id": file_id,
                "company_id": company_id,
                "upload_filename": safe_filename,
                "uploads_used": company.uploads_used,
                "uploads_limit": company.uploads_limit,
            },
        )

        # Promove ao object storage (R2/Spaces) quando configurado; senão usa o
        # path local. A ref resultante é o que o worker recebe.
        file_ref = storage.store_from_local(
            local_file_path, f"uploads/{company_id}/{file_id}_{safe_filename}"
        )

        # Guarda a ref de origem (habilita reprocessar quando RETAIN_SOURCE_FILES=true).
        db.query(UploadedFile).filter(UploadedFile.id == file_id).update({"source_ref": file_ref})
        db.commit()

        # Guard de mudança de base no upload manual: se NÃO for forçado, o worker
        # exige confirmação (status "needs_confirmation") quando o arquivo parece
        # substituir a base por uma diferente. force=true (reenvio confirmado) pula.
        process_sales_file.delay(
            file_id, company_id, file_ref,
            guard_base_shrink=not force, confirmable_guard=not force,
        )
    except Exception as exc:
        storage.cleanup_local(local_file_path)
        _refund_upload(db, file_id, company_id)
        logger.error("file.upload.enqueue_error", extra={"file_id": file_id, "error": str(exc)})
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "error": "Falha ao enfileirar o processamento do arquivo. Tente novamente.",
            },
        )

    return {
        "success": True,
        "data": {
            "id": file_id,
            "status": "processing",
            "message": "Enviado para a fila de processamento.",
        },
    }


@router.post("/{file_id}/reprocess")
def reprocess_file(
    file_id: str,
    token_data=Depends(require_upload_permission),
    db: Session = Depends(get_db_session),
):
    """
    Re-executa o ETL sobre o arquivo de origem, sem novo upload. Só funciona se
    a empresa habilitou RETAIN_SOURCE_FILES (retenção do arquivo bruto) — senão
    a fonte foi apagada após o processamento (padrão LGPD) e é preciso reenviar.
    Não conta contra a cota de uploads.
    """
    db_file = (
        db.query(UploadedFile)
        .filter(UploadedFile.id == file_id, UploadedFile.company_id == token_data.company_id)
        .first()
    )
    if not db_file:
        raise HTTPException(status_code=404, detail="Arquivo não encontrado.")
    if not db_file.source_ref or not storage.source_exists(db_file.source_ref):
        raise HTTPException(
            status_code=409,
            detail="Fonte não disponível para reprocessamento. Reenvie o arquivo "
            "(retenção de origem desligada por padrão — LGPD).",
        )

    db_file.status = "processing"
    db_file.error_message = None
    db.commit()
    # preserve_source: reprocessar nunca apaga a própria fonte (retida por opt-in
    # ou buffer de ingest) — a política de deleção pertence ao fluxo original.
    process_sales_file.delay(file_id, token_data.company_id, db_file.source_ref, preserve_source=True)
    return {"success": True, "data": {"id": file_id, "status": "processing"}}


@router.get("/{file_id}/status")
def get_file_status(
    file_id: str,
    token_data=Depends(get_current_user_and_company),
    db: Session = Depends(get_db_session),
):
    file_entry = (
        db.query(UploadedFile)
        .filter(
            UploadedFile.id == file_id,
            UploadedFile.company_id == token_data.company_id,
        )
        .first()
    )

    if not file_entry:
        raise HTTPException(status_code=404, detail="Arquivo não encontrado.")

    return {
        "success": True,
        "data": {
            "id": file_entry.id,
            "status": file_entry.status,
            "errorMessage": file_entry.error_message,
        },
    }


@router.get("/")
def list_files(
    token_data=Depends(get_current_user_and_company),
    db: Session = Depends(get_db_session),
    limit: int = Query(default=200, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
):
    # Paginação: a lista cresce 1 linha por upload. Default alto (200) mantém o
    # comportamento atual p/ empresas típicas; total vem em `pagination`.
    base = (
        db.query(UploadedFile, AnalysisResult)
        .outerjoin(AnalysisResult, AnalysisResult.file_id == UploadedFile.id)
        .filter(UploadedFile.company_id == token_data.company_id)
    )
    total = base.count()
    results = (
        base.order_by(UploadedFile.uploaded_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    return {
        "success": True,
        "pagination": {"total": total, "limit": limit, "offset": offset},
        "data": [
            {
                "id": f.id,
                "filename": f.filename,
                "status": f.status,
                "uploadedAt": f.uploaded_at.isoformat(),
                "errorMessage": f.error_message,
                "lostRevenue": analysis.lost_revenue if analysis else 0,
                "totalRevenue": analysis.total_revenue if analysis else 0,
                "opportunities": analysis.opportunities_count if analysis else 0,
            }
            for f, analysis in results
        ],
    }


@router.delete("/{file_id}")
def delete_file(
    file_id: str,
    token_data=Depends(get_current_user_and_company),
    db: Session = Depends(get_db_session),
):
    file_entry = (
        db.query(UploadedFile)
        .filter(
            UploadedFile.id == file_id,
            UploadedFile.company_id == token_data.company_id,
        )
        .first()
    )

    if not file_entry:
        raise HTTPException(status_code=404, detail="Arquivo não encontrado.")

    db.query(AnalysisResult).filter(AnalysisResult.file_id == file_id).delete()
    db.delete(file_entry)
    db.commit()

    logger.info("file.deleted", extra={"file_id": file_id, "company_id": token_data.company_id})

    return {"success": True, "message": "Arquivo removido com sucesso."}