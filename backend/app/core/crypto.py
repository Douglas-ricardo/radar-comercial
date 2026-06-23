"""Cifragem simétrica de segredos em repouso (MFA secret, config de IdP/SSO, tokens OAuth de CRM).

Usa Fernet (AES-128-CBC + HMAC). A chave vem de SSO_ENC_KEY no ambiente; se ausente,
é derivada de SECRET_KEY (degradação graciosa em dev). Em produção, defina SSO_ENC_KEY
explicitamente — uma chave Fernet de 32 bytes url-safe base64:

    python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
"""
import base64
import hashlib
import logging
import os

from cryptography.fernet import Fernet, InvalidToken

logger = logging.getLogger(__name__)

_fernet: Fernet | None = None


def _get_fernet() -> Fernet:
    global _fernet
    if _fernet is not None:
        return _fernet

    key = os.getenv("SSO_ENC_KEY")
    if key:
        key_bytes = key.encode()
    else:
        # Deriva uma chave Fernet determinística de SECRET_KEY (dev/fallback).
        secret = os.getenv("SECRET_KEY", "dev-secret")
        digest = hashlib.sha256(secret.encode()).digest()
        key_bytes = base64.urlsafe_b64encode(digest)
        logger.warning("crypto.using_derived_key", extra={"hint": "defina SSO_ENC_KEY em produção"})

    _fernet = Fernet(key_bytes)
    return _fernet


def encrypt(plaintext: str) -> str:
    """Cifra uma string. Retorna texto cifrado url-safe (str)."""
    return _get_fernet().encrypt(plaintext.encode()).decode()


def decrypt(token: str) -> str | None:
    """Decifra. Retorna None se o token for inválido/corrompido (nunca levanta)."""
    try:
        return _get_fernet().decrypt(token.encode()).decode()
    except (InvalidToken, ValueError, TypeError) as exc:
        logger.warning("crypto.decrypt_error", extra={"error": str(exc)})
        return None
