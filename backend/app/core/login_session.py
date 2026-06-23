"""Emissão de sessão de login compartilhada entre auth (senha/MFA) e SSO.

Centraliza: extração de IP, criação da sessão durável, montagem do JWT com sid e
gravação do cookie httpOnly. Usado por app/api/auth.py e app/api/sso.py.
"""
import os

from fastapi import Request, Response
from sqlalchemy.orm import Session

from app.core.security import create_access_token
from app.core.sessions import create_session
from app.domain.models import User, Company

COOKIE_SECURE = os.getenv("COOKIE_SECURE", "false").lower() == "true"


def client_ip(request: Request) -> str | None:
    """IP real do cliente, respeitando X-Forwarded-For (primeiro hop)."""
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else None


def set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key="radar_session",
        value=token,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite="lax",
        max_age=60 * 60 * 24 * 7,  # 7 dias
    )


def issue_login(request: Request, response: Response, db: Session, user: User, company: Company) -> str:
    """Cria sessão durável, embute sid no JWT, seta o cookie e retorna o token."""
    sid = create_session(
        db, user_id=user.id, company_id=company.id,
        ip=client_ip(request), user_agent=request.headers.get("user-agent"),
    )
    token = create_access_token(data={
        "sub": user.id,
        "company_id": company.id,
        "role": user.role,
        "scope": user.scope,
        "cv": user.credential_version or 0,
        "sid": sid,
    })
    set_session_cookie(response, token)
    return token
