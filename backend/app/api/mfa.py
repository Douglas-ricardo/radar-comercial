# app/api/mfa.py
import base64
import io
import logging

import qrcode
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core import crypto
from app.core.auth import get_current_user_and_company
from app.core.rate_limit import limiter
from app.core.security import verify_password
from app.domain.models import User
from app.infrastructure.database import get_db_session
from app.services import audit_service, mfa_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/mfa", tags=["MFA"])


class EnableRequest(BaseModel):
    code: str


class DisableRequest(BaseModel):
    password: str


def _qr_data_uri(uri: str) -> str:
    img = qrcode.make(uri)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


@router.get("/status")
def mfa_status(token=Depends(get_current_user_and_company), db: Session = Depends(get_db_session)):
    user = db.query(User).filter(User.id == token.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado.")
    remaining = len(user.mfa_backup_codes or [])
    return {"success": True, "data": {"enabled": user.mfa_enabled, "backupCodesRemaining": remaining}}


@router.post("/setup")
@limiter.limit("10/minute")
def mfa_setup(request: Request, token=Depends(get_current_user_and_company), db: Session = Depends(get_db_session)):
    """Gera um secret TOTP novo (ainda não ativa) e devolve o QR + secret para conferência."""
    user = db.query(User).filter(User.id == token.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado.")
    if user.mfa_enabled:
        raise HTTPException(status_code=400, detail="MFA já está ativo. Desative antes de reconfigurar.")

    secret = mfa_service.generate_secret()
    # Guarda o secret cifrado já no setup; só vira mfa_enabled após confirmar o 1º código.
    user.mfa_secret = crypto.encrypt(secret)
    db.commit()

    uri = mfa_service.provisioning_uri(secret, user.email)
    return {"success": True, "data": {"qrcode": _qr_data_uri(uri), "secret": secret}}


@router.post("/enable")
@limiter.limit("10/minute")
def mfa_enable(request: Request, data: EnableRequest, token=Depends(get_current_user_and_company), db: Session = Depends(get_db_session)):
    """Confirma o 1º código TOTP, ativa o MFA e devolve os backup codes (mostrados 1x)."""
    user = db.query(User).filter(User.id == token.user_id).first()
    if not user or not user.mfa_secret:
        raise HTTPException(status_code=400, detail="Inicie a configuração do MFA primeiro.")
    if user.mfa_enabled:
        raise HTTPException(status_code=400, detail="MFA já está ativo.")

    secret = crypto.decrypt(user.mfa_secret)
    if not secret or not mfa_service.verify_totp(secret, data.code):
        raise HTTPException(status_code=400, detail="Código inválido. Tente novamente.")

    plain_codes, hashes = mfa_service.generate_backup_codes()
    user.mfa_enabled = True
    user.mfa_backup_codes = hashes
    db.commit()

    audit_service.log_action(db, company_id=user.company_id, action="mfa.enabled", user_id=user.id, user_name=user.name)
    db.commit()
    return {"success": True, "data": {"backupCodes": plain_codes}}


@router.post("/disable")
@limiter.limit("10/minute")
def mfa_disable(request: Request, data: DisableRequest, token=Depends(get_current_user_and_company), db: Session = Depends(get_db_session)):
    """Desativa o MFA — exige a senha como confirmação."""
    user = db.query(User).filter(User.id == token.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado.")
    if not verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Senha incorreta.")

    user.mfa_enabled = False
    user.mfa_secret = None
    user.mfa_backup_codes = []
    db.commit()

    audit_service.log_action(db, company_id=user.company_id, action="mfa.disabled", user_id=user.id, user_name=user.name)
    db.commit()
    return {"success": True}


@router.post("/backup-codes/regenerate")
@limiter.limit("5/minute")
def regenerate_backup_codes(request: Request, token=Depends(get_current_user_and_company), db: Session = Depends(get_db_session)):
    user = db.query(User).filter(User.id == token.user_id).first()
    if not user or not user.mfa_enabled:
        raise HTTPException(status_code=400, detail="Ative o MFA primeiro.")
    plain_codes, hashes = mfa_service.generate_backup_codes()
    user.mfa_backup_codes = hashes
    db.commit()
    audit_service.log_action(db, company_id=user.company_id, action="mfa.backup_codes_regenerated", user_id=user.id)
    db.commit()
    return {"success": True, "data": {"backupCodes": plain_codes}}
