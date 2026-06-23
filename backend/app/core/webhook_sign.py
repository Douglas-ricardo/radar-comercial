# app/core/webhook_sign.py
"""Token assinado para o webhook do Evolution.

O webhook é público (o Evolution chama sem login). O token na URL identifica a
empresa de forma assinada — impede que terceiros forjem eventos para outro tenant.
"""
import jwt

from app.core.auth import SECRET_KEY, ALGORITHM

_PURPOSE = "evolution_webhook"


def make_webhook_token(company_id: str) -> str:
    return jwt.encode(
        {"cid": company_id, "purpose": _PURPOSE}, SECRET_KEY, algorithm=ALGORITHM
    )


def verify_webhook_token(token: str) -> str | None:
    """Retorna company_id se válido, senão None."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.PyJWTError:
        return None
    if payload.get("purpose") != _PURPOSE:
        return None
    return payload.get("cid")
