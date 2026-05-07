# app/api/auth.py
import hashlib
import logging
import os
import secrets
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status, Response, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.infrastructure.database import get_db_session
from app.infrastructure.redis_client import redis_client
from app.domain.models import User, Company
from app.core.security import verify_password, get_password_hash, create_access_token
from app.core.auth import get_current_user_and_company
from app.core.rate_limit import limiter
from app.services.plan_service import PlanService
from app.services.notification_service import NotificationService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

# Cookie em produção precisa de Secure=True (HTTPS); em dev (HTTP) fica False.
COOKIE_SECURE = os.getenv("COOKIE_SECURE", "false").lower() == "true"


class LoginRequest(BaseModel):
    email: str
    password: str


class SignupRequest(BaseModel):
    name: str
    email: str
    password: str
    companyName: str
    cnpj: Optional[str] = None


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class ForgotPasswordRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


_RESET_TOKEN_TTL = 60 * 30  # 30 minutos
_RESET_KEY_PREFIX = "pwd_reset:"


def _build_auth_response(token: str, user: User, company: Company) -> dict:
    """
    Monta o payload de resposta de autenticação.
    Fonte única — qualquer campo novo (ex: last_login_at) é adicionado
    aqui e reflete automaticamente em /signup, /login e /me.
    """
    return {
        "token": token,
        "user": {
            "id": user.id,
            "name": user.name,
            "email": user.email,
            "role": user.role,
            "companyId": company.id,
        },
        "company": {
            "id": company.id,
            "name": company.name,
            "plan": company.plan,
            "uploadsLimit": company.uploads_limit,
            "uploadsUsed": company.uploads_used,
        },
    }


@router.post("/signup")
@limiter.limit("5/minute")
def signup(request: Request, data: SignupRequest, response: Response, db: Session = Depends(get_db_session)):
    if db.query(User).filter(User.email == data.email).first():
        raise HTTPException(status_code=400, detail="Este email já está registado.")

    new_company = Company(
        name=data.companyName,
        cnpj=data.cnpj,
        plan="free",
        uploads_limit=PlanService.get_upload_limit_for_plan("free"),
    )
    db.add(new_company)
    db.commit()
    db.refresh(new_company)

    new_user = User(
        email=data.email,
        name=data.name,
        hashed_password=get_password_hash(data.password),
        role="admin",
        company_id=new_company.id,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    logger.info("auth.signup", extra={"company_id": new_company.id, "user_id": new_user.id})

    token_data = {"sub": new_user.id, "company_id": new_company.id, "role": new_user.role}
    access_token = create_access_token(data=token_data)

    response.set_cookie(
        key="radar_session",
        value=access_token,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite="lax",
        max_age=60 * 60 * 24 * 7, # 7 dias
    )

    return {"success": True, "data": _build_auth_response(access_token, new_user, new_company)}


@router.post("/login")
@limiter.limit("10/minute")
def login(request: Request, data: LoginRequest, response: Response, db: Session = Depends(get_db_session)):
    user = db.query(User).filter(User.email == data.email).first()

    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email ou senha incorretos.",
        )

    company = db.query(Company).filter(Company.id == user.company_id).first()
    if not company:
        logger.error("auth.login.company_not_found", extra={"user_id": user.id})
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Empresa associada ao usuário não encontrada. Contacte o suporte.",
        )

    logger.info("auth.login", extra={"user_id": user.id, "company_id": company.id})

    token_data = {"sub": user.id, "company_id": company.id, "role": user.role}
    access_token = create_access_token(data=token_data)

    # Adiciona o Cookie na resposta
    response.set_cookie(
        key="radar_session",
        value=access_token,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite="lax",
        max_age=60 * 60 * 24 * 7,
    )

    return {"success": True, "data": _build_auth_response(access_token, user, company)}


@router.get("/me")
def get_me(
    token_data=Depends(get_current_user_and_company),
    db: Session = Depends(get_db_session),
):
    user = db.query(User).filter(User.id == token_data.user_id).first()
    company = db.query(Company).filter(Company.id == token_data.company_id).first()

    if not user or not company:
        raise HTTPException(status_code=404, detail="Utilizador ou empresa não encontrados.")

    # /me não devolve token — monta payload sem ele
    payload = _build_auth_response("", user, company)
    payload.pop("token")
    return {"success": True, "data": payload}


@router.post("/logout")
def logout(response: Response):
    response.delete_cookie("radar_session")
    return {"success": True}


@router.post("/change-password")
@limiter.limit("5/minute")
def change_password(
    request: Request,
    data: ChangePasswordRequest,
    token_data=Depends(get_current_user_and_company),
    db: Session = Depends(get_db_session),
):
    user = db.query(User).filter(User.id == token_data.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Utilizador não encontrado.")

    if not verify_password(data.current_password, user.hashed_password):
        logger.warning("auth.change_password.invalid_current", extra={"user_id": user.id})
        raise HTTPException(status_code=400, detail="Senha atual incorreta.")

    if len(data.new_password) < 8:
        raise HTTPException(
            status_code=400,
            detail="A nova senha deve ter no mínimo 8 caracteres.",
        )

    if data.current_password == data.new_password:
        raise HTTPException(
            status_code=400,
            detail="A nova senha deve ser diferente da atual.",
        )

    user.hashed_password = get_password_hash(data.new_password)
    db.commit()

    logger.info("auth.change_password.success", extra={"user_id": user.id})
    return {"success": True}


@router.post("/forgot-password")
@limiter.limit("3/minute")
def forgot_password(
    request: Request,
    data: ForgotPasswordRequest,
    db: Session = Depends(get_db_session),
):
    """
    Generates a password-reset token (TTL 30min) and emails it.
    Always returns success to prevent email enumeration attacks.
    """
    generic_response = {
        "success": True,
        "message": "Se o email existir, um link de recuperação foi enviado.",
    }

    user = db.query(User).filter(User.email == data.email.strip().lower()).first()
    if not user:
        return generic_response

    token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(token.encode()).hexdigest()

    try:
        redis_client.setex(f"{_RESET_KEY_PREFIX}{token_hash}", _RESET_TOKEN_TTL, user.id)
    except Exception as exc:
        logger.error("auth.forgot_password.redis_error", extra={"error": str(exc)})
        return generic_response

    app_url = os.getenv("APP_BASE_URL", "http://localhost:3000")
    reset_url = f"{app_url}/reset-password?token={token}"
    html = f"""
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
      <h2 style="color:#1a1a2e">Recuperação de senha</h2>
      <p>Olá {user.name}, recebemos uma solicitação para redefinir sua senha do Radar Comercial.</p>
      <p style="margin-top:24px">
        <a href="{reset_url}" style="background:#4F46E5;color:white;padding:12px 24px;text-decoration:none;border-radius:6px">
          Redefinir minha senha
        </a>
      </p>
      <p style="color:#888;font-size:12px;margin-top:24px">
        Este link expira em 30 minutos. Se você não solicitou isso, ignore este email.
      </p>
    </div>
    """
    NotificationService.send_email(user.email, "Recuperação de senha — Radar Comercial", html)
    logger.info("auth.forgot_password.email_sent", extra={"user_id": user.id})

    return generic_response


@router.post("/reset-password")
@limiter.limit("5/minute")
def reset_password(
    request: Request,
    data: ResetPasswordRequest,
    db: Session = Depends(get_db_session),
):
    if len(data.new_password) < 8:
        raise HTTPException(status_code=400, detail="A nova senha deve ter no mínimo 8 caracteres.")

    token_hash = hashlib.sha256(data.token.encode()).hexdigest()
    redis_key = f"{_RESET_KEY_PREFIX}{token_hash}"

    try:
        user_id = redis_client.get(redis_key)
        if isinstance(user_id, bytes):
            user_id = user_id.decode()
    except Exception as exc:
        logger.error("auth.reset_password.redis_error", extra={"error": str(exc)})
        raise HTTPException(status_code=500, detail="Erro ao validar token. Tente novamente.")

    if not user_id:
        raise HTTPException(status_code=400, detail="Token inválido ou expirado.")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=400, detail="Token inválido.")

    user.hashed_password = get_password_hash(data.new_password)
    db.commit()

    try:
        redis_client.delete(redis_key)
    except Exception:
        pass

    logger.info("auth.reset_password.success", extra={"user_id": user.id})
    return {"success": True, "message": "Senha redefinida com sucesso."}