# app/api/integrations.py
import csv
import hashlib
import logging
import os
import secrets
import uuid
from datetime import datetime
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.auth import get_current_user_and_company, validate_api_key
from app.core.rate_limit import limiter
from app.domain.models import ApiKey, UploadedFile
from app.infrastructure.database import get_db_session
from app.workers.tasks import process_sales_file

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


# ── API Key management ────────────────────────────────────────────────────────

@router.get("/keys")
def list_keys(
    token_data=Depends(get_current_user_and_company),
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
    token_data=Depends(get_current_user_and_company),
    db: Session = Depends(get_db_session),
):
    if token_data.role != "admin":
        raise HTTPException(status_code=403, detail="Apenas administradores podem criar API Keys.")

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
    token_data=Depends(get_current_user_and_company),
    db: Session = Depends(get_db_session),
):
    if token_data.role != "admin":
        raise HTTPException(status_code=403, detail="Apenas administradores podem revogar API Keys.")

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
        filename=f"api_ingest_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.csv",
        status="pending",
    )
    db.add(file_record)
    db.commit()
    db.refresh(file_record)

    process_sales_file.delay(file_record.id, company_id, tmp_path)

    logger.info(
        "integrations.ingest.dispatched",
        extra={"company_id": company_id, "records": len(body.records), "file_id": file_record.id},
    )

    return {
        "success": True,
        "data": {"file_id": file_record.id, "records_queued": len(body.records)},
        "message": "Dados recebidos e em processamento.",
    }
