"""Serviço de MFA (TOTP) — geração de secret, QR e verificação de código/backup.

O secret TOTP é guardado cifrado (Fernet) em User.mfa_secret. Os backup codes são
guardados como SHA-256 (nunca em claro), consumidos uma única vez.
"""
import hashlib
import logging
import secrets

import pyotp
from sqlalchemy.orm import Session

from app.core import crypto

logger = logging.getLogger(__name__)

_ISSUER = "Radar Comercial"


def generate_secret() -> str:
    """Gera um novo secret TOTP base32 (em claro — cifre antes de persistir)."""
    return pyotp.random_base32()


def provisioning_uri(secret: str, email: str) -> str:
    """URI otpauth:// para gerar o QR code no app autenticador."""
    return pyotp.totp.TOTP(secret).provisioning_uri(name=email, issuer_name=_ISSUER)


def verify_totp(secret: str, code: str) -> bool:
    """Valida um código TOTP de 6 dígitos (janela ±1 para tolerar drift de relógio)."""
    if not secret or not code:
        return False
    return pyotp.TOTP(secret).verify(code.strip().replace(" ", ""), valid_window=1)


def generate_backup_codes(n: int = 10) -> tuple[list[str], list[str]]:
    """Retorna (códigos_em_claro, hashes). Mostre os em claro 1x; persista os hashes."""
    plain = [f"{secrets.randbelow(10**8):08d}" for _ in range(n)]
    hashes = [hashlib.sha256(c.encode()).hexdigest() for c in plain]
    return plain, hashes


def verify_user_code(db: Session, user, code: str) -> bool:
    """Valida código contra o TOTP do usuário ou contra um backup code (consome-o)."""
    code = (code or "").strip().replace(" ", "")
    secret = crypto.decrypt(user.mfa_secret) if user.mfa_secret else None
    if secret and verify_totp(secret, code):
        return True

    # Tenta backup code (consumo único)
    code_hash = hashlib.sha256(code.encode()).hexdigest()
    codes = list(user.mfa_backup_codes or [])
    if code_hash in codes:
        codes.remove(code_hash)
        user.mfa_backup_codes = codes
        db.commit()
        logger.info("mfa.backup_code.consumed", extra={"user_id": user.id})
        return True
    return False
