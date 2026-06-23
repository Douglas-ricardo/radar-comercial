# app/core/unsubscribe.py
"""Token assinado para o link de descadastro (LGPD) nos emails ao cliente final.

Sem login: o cliente clica no link, o token identifica (empresa, cliente) de forma
assinada e à prova de adulteração. Reusa o SECRET_KEY do projeto.
"""
import jwt

from app.core.auth import SECRET_KEY, ALGORITHM

_PURPOSE = "unsubscribe"


def make_unsubscribe_token(company_id: str, customer_hash: str) -> str:
    return jwt.encode(
        {"cid": company_id, "ch": customer_hash, "purpose": _PURPOSE},
        SECRET_KEY, algorithm=ALGORITHM,
    )


def verify_unsubscribe_token(token: str) -> tuple[str, str] | None:
    """Retorna (company_id, customer_hash) se válido, senão None."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.PyJWTError:
        return None
    if payload.get("purpose") != _PURPOSE:
        return None
    cid, ch = payload.get("cid"), payload.get("ch")
    if not cid or not ch:
        return None
    return cid, ch
