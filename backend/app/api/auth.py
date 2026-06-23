# app/api/auth.py
import hashlib
import ipaddress
import logging
import os
import secrets
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status, Response, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.infrastructure.database import get_db_session
from app.infrastructure.redis_client import redis_client
from app.domain.models import User, Company, UserSession
from app.core.security import (
    verify_password,
    get_password_hash,
    create_access_token,
    validate_password_strength,
)
from app.core.auth import get_current_user_and_company
from app.core.clock import utcnow
from app.core.rate_limit import limiter
from app.core.sessions import create_session, revoke_session
from app.core.login_session import client_ip as _client_ip, set_session_cookie as _set_session_cookie, issue_login as _issue_login
from app.services.plan_service import PlanService
from app.services.notification_service import NotificationService
from app.services import audit_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

# Cookie em produção precisa de Secure=True (HTTPS); em dev (HTTP) fica False.
COOKIE_SECURE = os.getenv("COOKIE_SECURE", "false").lower() == "true"
_MFA_PENDING_TTL = 60 * 5  # 5 min para concluir o 2º passo do login
_MFA_PENDING_PREFIX = "mfa_pending:"


def _ip_allowed(company: Company, ip: str | None) -> bool:
    """True se o IP está dentro do allowlist da empresa (ou se não há allowlist)."""
    allowlist = getattr(company, "ip_allowlist", None) or []
    if not allowlist:
        return True
    if not ip:
        return False
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return False
    for cidr in allowlist:
        try:
            if addr in ipaddress.ip_network(cidr, strict=False):
                return True
        except ValueError:
            continue
    return False


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


class SetPasswordRequest(BaseModel):
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
            "scope": user.scope,
            "status": user.status,
            "companyId": company.id,
            "createdAt": user.created_at.isoformat() if user.created_at else None,
            "updatedAt": user.updated_at.isoformat() if user.updated_at else None,
        },
        "company": {
            "id": company.id,
            "name": company.name,
            "plan": company.plan,
            "uploadsLimit": company.uploads_limit,
            "uploadsUsed": company.uploads_used,
            "ownerId": company.owner_id,
            "createdAt": company.created_at.isoformat() if company.created_at else None,
            "updatedAt": company.updated_at.isoformat() if company.updated_at else None,
        },
    }


@router.post("/signup")
@limiter.limit("5/minute")
def signup(request: Request, data: SignupRequest, response: Response, db: Session = Depends(get_db_session)):
    email = data.email.strip().lower()

    pwd_error = validate_password_strength(data.password)
    if pwd_error:
        raise HTTPException(status_code=400, detail=pwd_error)

    if db.query(User).filter(User.email == email).first():
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
        email=email,
        name=data.name,
        hashed_password=get_password_hash(data.password),
        role="admin",
        company_id=new_company.id,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    # Fundador = primeiro admin. Preenche owner_id (contrato types/index.ts).
    new_company.owner_id = new_user.id
    db.commit()

    logger.info("auth.signup", extra={"company_id": new_company.id, "user_id": new_user.id})

    access_token = _issue_login(request, response, db, new_user, new_company)

    return {"success": True, "data": _build_auth_response(access_token, new_user, new_company)}


@router.post("/login")
@limiter.limit("10/minute")
def login(request: Request, data: LoginRequest, response: Response, db: Session = Depends(get_db_session)):
    user = db.query(User).filter(User.email == data.email.strip().lower()).first()

    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email ou senha incorretos.",
        )

    # Conta desativada via SCIM/IdP — bloqueia o login.
    if user.status == "disabled":
        raise HTTPException(status_code=403, detail="Conta desativada. Contacte o administrador.")

    company = db.query(Company).filter(Company.id == user.company_id).first()
    if not company:
        logger.error("auth.login.company_not_found", extra={"user_id": user.id})
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Empresa associada ao usuário não encontrada. Contacte o suporte.",
        )

    # IP allowlist (enterprise): bloqueia login fora dos CIDRs configurados.
    ip = _client_ip(request)
    if not _ip_allowed(company, ip):
        audit_service.log_action(db, company_id=company.id, action="login.blocked_ip",
                                  user_id=user.id, user_name=user.name, details={"ip": ip})
        db.commit()
        logger.warning("auth.login.blocked_ip", extra={"user_id": user.id, "ip": ip})
        raise HTTPException(status_code=403, detail="Acesso bloqueado para o seu endereço de rede.")

    # MFA (2 passos): se ativo, não emite o cookie ainda — devolve um token pendente
    # de curta duração e exige o código TOTP em /auth/mfa/verify.
    if user.mfa_enabled:
        pending = secrets.token_urlsafe(32)
        try:
            redis_client.setex(f"{_MFA_PENDING_PREFIX}{hashlib.sha256(pending.encode()).hexdigest()}",
                               _MFA_PENDING_TTL, user.id)
        except Exception as exc:
            logger.error("auth.login.mfa_redis_error", extra={"error": str(exc)})
            raise HTTPException(status_code=500, detail="Erro ao iniciar verificação. Tente novamente.")
        logger.info("auth.login.mfa_required", extra={"user_id": user.id})
        return {"success": True, "data": {"mfaRequired": True, "mfaToken": pending}}

    logger.info("auth.login", extra={"user_id": user.id, "company_id": company.id})

    access_token = _issue_login(request, response, db, user, company)
    audit_service.log_action(db, company_id=company.id, action="auth.login",
                             user_id=user.id, user_name=user.name, details={"ip": ip})
    db.commit()

    auth_data = _build_auth_response(access_token, user, company)
    auth_data["requiresPasswordChange"] = (user.status == "pending")
    return {"success": True, "data": auth_data}


class MfaVerifyRequest(BaseModel):
    mfa_token: str
    code: str


@router.post("/mfa/verify")
@limiter.limit("10/minute")
def mfa_verify(request: Request, data: MfaVerifyRequest, response: Response, db: Session = Depends(get_db_session)):
    """2º passo do login com MFA: valida o código TOTP (ou backup code) e emite o cookie."""
    token_hash = hashlib.sha256(data.mfa_token.encode()).hexdigest()
    redis_key = f"{_MFA_PENDING_PREFIX}{token_hash}"
    try:
        user_id = redis_client.get(redis_key)
        if isinstance(user_id, bytes):
            user_id = user_id.decode()
    except Exception:
        user_id = None
    if not user_id:
        raise HTTPException(status_code=400, detail="Sessão de verificação expirada. Faça login novamente.")

    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.mfa_enabled:
        raise HTTPException(status_code=400, detail="Verificação inválida.")

    from app.services.mfa_service import verify_user_code
    if not verify_user_code(db, user, data.code):
        logger.warning("auth.mfa_verify.invalid", extra={"user_id": user.id})
        raise HTTPException(status_code=400, detail="Código inválido.")

    try:
        redis_client.delete(redis_key)
    except Exception:
        pass

    company = db.query(Company).filter(Company.id == user.company_id).first()
    access_token = _issue_login(request, response, db, user, company)
    audit_service.log_action(db, company_id=company.id, action="auth.login",
                             user_id=user.id, user_name=user.name, details={"mfa": True})
    db.commit()

    auth_data = _build_auth_response(access_token, user, company)
    auth_data["requiresPasswordChange"] = (user.status == "pending")
    return {"success": True, "data": auth_data}


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
def logout(
    response: Response,
    request: Request,
    db: Session = Depends(get_db_session),
):
    # Revoga a sessão durável (se houver sid no token) antes de limpar o cookie.
    token = request.cookies.get("radar_session")
    if token:
        try:
            import jwt as _jwt
            from app.core.auth import SECRET_KEY, ALGORITHM
            payload = _jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM], options={"verify_exp": False})
            sid = payload.get("sid")
            if sid:
                revoke_session(db, sid)
        except Exception:
            pass
    response.delete_cookie("radar_session")
    return {"success": True}


@router.get("/sessions")
def list_sessions(
    token_data=Depends(get_current_user_and_company),
    db: Session = Depends(get_db_session),
):
    """Sessões ativas do usuário atual (para a aba Segurança)."""
    sessions = (
        db.query(UserSession)
        .filter(UserSession.user_id == token_data.user_id, UserSession.revoked_at.is_(None))
        .order_by(UserSession.last_seen_at.desc())
        .all()
    )
    return {
        "success": True,
        "data": [
            {
                "id": s.id,
                "ip": s.ip,
                "userAgent": s.user_agent,
                "createdAt": s.created_at.isoformat() if s.created_at else None,
                "lastSeenAt": s.last_seen_at.isoformat() if s.last_seen_at else None,
                "current": s.id == token_data.sid,
            }
            for s in sessions
        ],
    }


@router.delete("/sessions/{session_id}")
def revoke_one_session(
    session_id: str,
    token_data=Depends(get_current_user_and_company),
    db: Session = Depends(get_db_session),
):
    sess = db.query(UserSession).filter(
        UserSession.id == session_id, UserSession.user_id == token_data.user_id
    ).first()
    if not sess:
        raise HTTPException(status_code=404, detail="Sessão não encontrada.")
    revoke_session(db, session_id)
    audit_service.log_action(db, company_id=token_data.company_id, action="session.revoked",
                             user_id=token_data.user_id, details={"session_id": session_id})
    db.commit()
    return {"success": True}


@router.delete("/sessions")
def revoke_other_sessions(
    token_data=Depends(get_current_user_and_company),
    db: Session = Depends(get_db_session),
):
    """Encerra todas as outras sessões, exceto a atual."""
    others = db.query(UserSession).filter(
        UserSession.user_id == token_data.user_id,
        UserSession.revoked_at.is_(None),
        UserSession.id != token_data.sid,
    ).all()
    for s in others:
        revoke_session(db, s.id)
    audit_service.log_action(db, company_id=token_data.company_id, action="session.revoked_all",
                             user_id=token_data.user_id, details={"count": len(others)})
    db.commit()
    return {"success": True, "data": {"revoked": len(others)}}


@router.post("/change-password")
@limiter.limit("5/minute")
def change_password(
    request: Request,
    data: ChangePasswordRequest,
    response: Response,
    token_data=Depends(get_current_user_and_company),
    db: Session = Depends(get_db_session),
):
    user = db.query(User).filter(User.id == token_data.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Utilizador não encontrado.")

    if not verify_password(data.current_password, user.hashed_password):
        logger.warning("auth.change_password.invalid_current", extra={"user_id": user.id})
        raise HTTPException(status_code=400, detail="Senha atual incorreta.")

    pwd_error = validate_password_strength(data.new_password)
    if pwd_error:
        raise HTTPException(status_code=400, detail=pwd_error)

    if data.current_password == data.new_password:
        raise HTTPException(
            status_code=400,
            detail="A nova senha deve ser diferente da atual.",
        )

    user.hashed_password = get_password_hash(data.new_password)
    # Invalida todos os JWTs emitidos antes desta troca.
    user.credential_version = (user.credential_version or 0) + 1
    db.commit()

    # Reemite o cookie (nova sessão) para o usuário não cair após o bump de cv.
    company = db.query(Company).filter(Company.id == user.company_id).first()
    _issue_login(request, response, db, user, company)

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
    pwd_error = validate_password_strength(data.new_password)
    if pwd_error:
        raise HTTPException(status_code=400, detail=pwd_error)

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
    # Invalida sessões antigas após reset.
    user.credential_version = (user.credential_version or 0) + 1
    db.commit()

    try:
        redis_client.delete(redis_key)
    except Exception:
        pass

    logger.info("auth.reset_password.success", extra={"user_id": user.id})
    return {"success": True, "message": "Senha redefinida com sucesso."}


@router.post("/set-password")
@limiter.limit("5/minute")
def set_password(
    request: Request,
    data: SetPasswordRequest,
    response: Response,
    token_data=Depends(get_current_user_and_company),
    db: Session = Depends(get_db_session),
):
    """Troca a senha temporária de um usuário convidado (status=pending) e ativa a conta."""
    user = db.query(User).filter(User.id == token_data.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Utilizador não encontrado.")

    if user.status != "pending":
        raise HTTPException(
            status_code=400,
            detail="Conta já ativada. Use 'alterar senha' nas configurações.",
        )

    pwd_error = validate_password_strength(data.new_password)
    if pwd_error:
        raise HTTPException(status_code=400, detail=pwd_error)

    user.hashed_password = get_password_hash(data.new_password)
    user.status = "active"
    user.credential_version = (user.credential_version or 0) + 1
    db.commit()

    company = db.query(Company).filter(Company.id == user.company_id).first()
    _issue_login(request, response, db, user, company)

    logger.info("auth.set_password.success", extra={"user_id": user.id})
    return {"success": True}