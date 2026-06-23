# app/core/auth.py
import logging
from app.core.clock import utcnow
import os

from fastapi import Request # Importe Request
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
import jwt
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.infrastructure.database import get_db_session

logger = logging.getLogger(__name__)

_secret = os.getenv("SECRET_KEY")
if not _secret:
    raise RuntimeError(
        "SECRET_KEY não definida. "
        "Defina no .env antes de iniciar. Exemplo: openssl rand -hex 32"
    )

SECRET_KEY = _secret
ALGORITHM = "HS256"

# (Opcional) Pode deixar isso aqui caso ferramentas de documentação como o Swagger precisem
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login")

class TokenData(BaseModel):
    user_id: str
    company_id: str
    role: str
    scope: str | None = None  # "branch:SP-001" → filtra carteira/clientes; None = sem restrição
    sid: str | None = None    # session id (sessão durável revogável); None = token legado
    permissions: list[str] = []   # permissões efetivas resolvidas (RBAC granular)
    org_unit_id: str | None = None  # unidade organizacional (territorialização hierárquica)

async def get_current_user_and_company(
    request: Request,
    db: Session = Depends(get_db_session),
) -> TokenData:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Não foi possível validar as credenciais.",
    )

    # Busca o token no cookie em vez do header
    token = request.cookies.get("radar_session")

    if not token:
        raise credentials_exception

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])

        # 🔴 CORREÇÃO: Extrair os dados do payload antes de usá-los
        user_id: str = payload.get("sub")
        company_id: str = payload.get("company_id")
        role: str = payload.get("role", "viewer")
        scope: str | None = payload.get("scope")
        token_cv: int = payload.get("cv", 0)
        sid: str | None = payload.get("sid")

        # 🔴 CORREÇÃO: Validar se os dados vitais estão lá
        if user_id is None or company_id is None:
            logger.warning("auth.token.invalid_payload")
            raise credentials_exception

        # Revogação: se a senha mudou após o token ser emitido, cv não bate.
        from app.domain.models import User
        user = db.query(User).filter(User.id == user_id).first()
        if not user or (user.credential_version or 0) != token_cv:
            logger.info("auth.token.revoked", extra={"user_id": user_id})
            raise credentials_exception

        # Revogação por sessão: se o token carrega sid e a sessão foi revogada, recusa.
        # Tokens legados (sem sid) seguem válidos até expirar — sem regressão.
        if sid:
            from app.core.sessions import is_session_revoked
            if is_session_revoked(db, sid):
                logger.info("auth.session.revoked", extra={"user_id": user_id, "sid": sid})
                raise credentials_exception

        # Resolve permissões efetivas (papel customizado ou preset legado) e a unidade.
        from app.core.permissions import resolve_permissions
        permissions = sorted(resolve_permissions(db, user))

        return TokenData(
            user_id=user_id, company_id=company_id, role=role, scope=scope, sid=sid,
            permissions=permissions, org_unit_id=getattr(user, "org_unit_id", None),
        )

    except jwt.ExpiredSignatureError:
        logger.info("auth.token.expired")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token expirado. Faça login novamente.",
        )

    except jwt.PyJWTError:
        logger.warning("auth.token.decode_error")
        raise credentials_exception


def require_admin(token_data: TokenData = Depends(get_current_user_and_company)) -> TokenData:
    if token_data.role != "admin":
        raise HTTPException(status_code=403, detail="Apenas administradores podem realizar esta ação.")
    return token_data


def require_analyst_or_above(token_data: TokenData = Depends(get_current_user_and_company)) -> TokenData:
    if token_data.role not in ("admin", "analyst"):
        raise HTTPException(status_code=403, detail="Privilégios insuficientes.")
    return token_data


def require_upload_permission(token_data: TokenData = Depends(get_current_user_and_company)):
    if token_data.role not in ["admin", "analyst"]:
        raise HTTPException(status_code=403, detail="Privilégios insuficientes para upload.")
    return token_data


def validate_api_key(x_api_key: str | None, db) -> str:
    """
    Validates X-API-Key header against stored SHA-256 hash.
    Returns company_id on success. Raises HTTP 401 on failure.
    Called directly from endpoints that read both X-API-Key and DB session.
    """
    import hashlib
    from datetime import datetime
    from app.domain.models import ApiKey

    if not x_api_key:
        raise HTTPException(status_code=401, detail="X-API-Key header obrigatório.")

    key_hash = hashlib.sha256(x_api_key.encode()).hexdigest()
    api_key = db.query(ApiKey).filter(
        ApiKey.key_hash == key_hash,
        ApiKey.is_active == True,
    ).first()

    if not api_key:
        raise HTTPException(status_code=401, detail="API Key inválida ou revogada.")

    api_key.last_used_at = utcnow()
    db.commit()
    return api_key.company_id