# app/api/integrations.py
import csv
import hashlib
import logging
import os
import secrets
import uuid
from datetime import datetime
from app.core.clock import utcnow
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import update
from sqlalchemy.orm import Session

from app.core.auth import get_current_user_and_company, require_admin, validate_api_key
from app.core.rate_limit import limiter
from app.domain.models import ApiKey, Company, IntegrationConfig, UploadedFile
from app.infrastructure.database import get_db_session
from app.infrastructure import storage
from app.services.plan_service import PlanService
from app.workers.tasks import process_sales_file
from app.workers.sync_tasks import sync_google_sheet

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/integrations", tags=["Integrations"])
ingest_router = APIRouter(prefix="/api/data", tags=["Ingest"])

_TEMP_DIR = Path(os.getenv("TEMP_DIR", str(Path(__file__).resolve().parent.parent.parent / "temp")))


def _hash_key(plaintext: str) -> str:
    return hashlib.sha256(plaintext.encode()).hexdigest()


class CreateKeyRequest(BaseModel):
    name: str


class SaleRecord(BaseModel):
    data: str
    cliente: str
    produto: Optional[str] = "Geral"
    quantidade: Optional[float] = 1.0
    valor: float


class IngestRequest(BaseModel):
    records: List[SaleRecord]


class SyncConfigRequest(BaseModel):
    sheet_url: str
    sheet_name: Optional[str] = None  # None = primeira aba
    enabled: bool = True


# ── API Key management ────────────────────────────────────────────────────────

@router.get("/keys")
def list_keys(
    token_data=Depends(require_admin),
    db: Session = Depends(get_db_session),
):
    keys = (
        db.query(ApiKey)
        .filter(ApiKey.company_id == token_data.company_id, ApiKey.is_active == True)
        .order_by(ApiKey.created_at.desc())
        .all()
    )
    return {
        "success": True,
        "data": [
            {
                "id": k.id,
                "name": k.name,
                "prefix": k.prefix,
                "lastUsedAt": k.last_used_at.isoformat() if k.last_used_at else None,
                "createdAt": k.created_at.isoformat() if k.created_at else None,
            }
            for k in keys
        ],
    }


@router.post("/keys")
def create_key(
    data: CreateKeyRequest,
    token_data=Depends(require_admin),
    db: Session = Depends(get_db_session),
):

    if not data.name.strip():
        raise HTTPException(status_code=400, detail="Nome da chave é obrigatório.")

    plaintext = f"rc_live_{secrets.token_urlsafe(32)}"
    key_hash = _hash_key(plaintext)
    prefix = plaintext[:16]  # "rc_live_" + 8 chars

    key = ApiKey(
        company_id=token_data.company_id,
        name=data.name.strip(),
        key_hash=key_hash,
        prefix=prefix,
    )
    db.add(key)
    db.commit()

    logger.info("integrations.key.created", extra={"company_id": token_data.company_id, "key_id": key.id})

    return {
        "success": True,
        "data": {"id": key.id, "name": key.name, "key": plaintext, "prefix": prefix},
        "message": "Guarde esta chave — ela não será exibida novamente.",
    }


@router.delete("/keys/{key_id}")
def revoke_key(
    key_id: str,
    token_data=Depends(require_admin),
    db: Session = Depends(get_db_session),
):

    key = db.query(ApiKey).filter(
        ApiKey.id == key_id,
        ApiKey.company_id == token_data.company_id,
    ).first()

    if not key:
        raise HTTPException(status_code=404, detail="Chave não encontrada.")

    key.is_active = False
    db.commit()

    logger.info("integrations.key.revoked", extra={"key_id": key_id, "company_id": token_data.company_id})
    return {"success": True, "message": "Chave revogada com sucesso."}


# ── Google Sheets sync config ─────────────────────────────────────────────────

@router.get("/sync/status")
def get_sync_status(
    token_data=Depends(require_admin),
    db: Session = Depends(get_db_session),
):
    cfg = db.query(IntegrationConfig).filter_by(
        company_id=token_data.company_id, type="google_sheets"
    ).first()
    if not cfg:
        return {"success": True, "data": None}
    return {
        "success": True,
        "data": {
            "id": cfg.id,
            "type": cfg.type,
            "sheetUrl": cfg.config.get("sheet_url"),
            "sheetName": cfg.config.get("sheet_name"),
            "enabled": cfg.enabled,
            "lastSyncAt": cfg.last_sync_at.isoformat() if cfg.last_sync_at else None,
            "lastSyncStatus": cfg.last_sync_status,
            "lastSyncError": cfg.last_sync_error,
        },
    }


@router.post("/sync/config")
def upsert_sync_config(
    data: SyncConfigRequest,
    token_data=Depends(require_admin),
    db: Session = Depends(get_db_session),
):

    if not data.sheet_url.strip():
        raise HTTPException(status_code=400, detail="URL da planilha é obrigatória.")

    cfg = db.query(IntegrationConfig).filter_by(
        company_id=token_data.company_id, type="google_sheets"
    ).first()

    config_payload = {"sheet_url": data.sheet_url.strip(), "sheet_name": data.sheet_name}

    if cfg:
        cfg.config = config_payload
        cfg.enabled = data.enabled
    else:
        cfg = IntegrationConfig(
            company_id=token_data.company_id,
            type="google_sheets",
            config=config_payload,
            enabled=data.enabled,
        )
        db.add(cfg)

    db.commit()
    db.refresh(cfg)

    logger.info("integrations.sync.config_saved", extra={
        "company_id": token_data.company_id, "type": "google_sheets",
    })
    return {"success": True, "data": {"id": cfg.id}, "message": "Configuração salva com sucesso."}


@router.post("/sync/trigger")
def trigger_sync(
    token_data=Depends(require_admin),
    db: Session = Depends(get_db_session),
):
    """Dispara sincronização imediata para testes — não aguarda o scheduler."""

    cfg = db.query(IntegrationConfig).filter_by(
        company_id=token_data.company_id, type="google_sheets"
    ).first()

    if not cfg or not cfg.enabled:
        raise HTTPException(status_code=404, detail="Nenhuma sincronização configurada ou desativada.")

    sync_google_sheet.delay(token_data.company_id, cfg.id)

    logger.info("integrations.sync.manual_trigger", extra={"company_id": token_data.company_id})
    return {"success": True, "message": "Sincronização disparada. Aguarde alguns instantes."}


# ── Data ingest endpoint ──────────────────────────────────────────────────────

@ingest_router.post("/ingest")
@limiter.limit("60/minute")
def ingest_data(
    request: Request,
    body: IngestRequest,
    x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
    db: Session = Depends(get_db_session),
):
    """
    Receives sales records from external systems (ERPs, n8n, etc.) authenticated
    via API Key. Serialises to CSV and dispatches the same Celery pipeline as
    a manual upload, so processing is identical.
    """
    company_id = validate_api_key(x_api_key, db)

    if not body.records:
        raise HTTPException(status_code=400, detail="Nenhum registro enviado.")

    # Cota de plano — mesma regra do upload manual (a ingestão via API NÃO pode
    # contornar o limite). Incremento atômico previne corrida; o worker reverte
    # uploads_used em caso de falha (_mark_failed).
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Empresa não encontrada.")
    PlanService.check_upload_limit(company)
    quota_stmt = (
        update(Company)
        .where(Company.id == company_id, Company.uploads_used < Company.uploads_limit)
        .values(uploads_used=Company.uploads_used + 1)
    )
    if db.execute(quota_stmt).rowcount == 0:
        db.rollback()
        raise HTTPException(status_code=403, detail="Limite de uploads do plano atingido.")
    db.commit()

    _TEMP_DIR.mkdir(parents=True, exist_ok=True)
    tmp_path = str(_TEMP_DIR / f"ingest_{company_id}_{uuid.uuid4().hex[:8]}.csv")

    try:
        with open(tmp_path, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=["data", "cliente", "produto", "quantidade", "valor"])
            writer.writeheader()
            for r in body.records:
                writer.writerow({
                    "data": r.data,
                    "cliente": r.cliente,
                    "produto": r.produto,
                    "quantidade": r.quantidade,
                    "valor": r.valor,
                })
    except Exception as exc:
        logger.error("integrations.ingest.write_error", extra={"company_id": company_id, "error": str(exc)})
        raise HTTPException(status_code=500, detail="Erro ao processar registros.")

    file_record = UploadedFile(
        company_id=company_id,
        filename=f"api_ingest_{utcnow().strftime('%Y%m%d_%H%M%S')}.csv",
        status="pending",
    )
    db.add(file_record)
    db.commit()
    db.refresh(file_record)

    file_ref = storage.store_from_local(tmp_path, f"ingest/{company_id}/{file_record.id}.csv")
    process_sales_file.delay(file_record.id, company_id, file_ref)

    logger.info(
        "integrations.ingest.dispatched",
        extra={"company_id": company_id, "records": len(body.records), "file_id": file_record.id},
    )

    return {
        "success": True,
        "data": {"file_id": file_record.id, "records_queued": len(body.records)},
        "message": "Dados recebidos e em processamento.",
    }
