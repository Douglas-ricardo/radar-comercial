# app/api/sso.py
import logging
import os
import secrets

from fastapi import APIRouter, Depends, HTTPException, Request, Response, Form
from fastapi.responses import RedirectResponse, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.auth import get_current_user_and_company
from app.core.login_session import issue_login
from app.core.rate_limit import limiter
from app.domain.models import Company, SSOConnection
from app.infrastructure.database import get_db_session
from app.infrastructure.redis_client import redis_client
from app.services import audit_service, sso_service
from app.services.plan_service import PlanService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/sso", tags=["SSO"])

API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:8000").rstrip("/")
FRONTEND_URL = os.getenv("APP_BASE_URL", "http://localhost:3000").rstrip("/")
_STATE_PREFIX = "sso_state:"
_STATE_TTL = 600  # 10 min


def _oidc_redirect_uri() -> str:
    return f"{API_BASE_URL}/api/sso/oidc/callback"


def _saml_acs_url() -> str:
    return f"{API_BASE_URL}/api/sso/saml/acs"


def _saml_entity_id(slug: str) -> str:
    return f"{API_BASE_URL}/api/sso/{slug}/saml/metadata"


# ─── Schemas ──────────────────────────────────────────────────────────────────

class SSOConnectionCreate(BaseModel):
    protocol: str                     # "oidc" | "saml"
    display_name: str | None = None
    default_role: str = "viewer"
    allowed_domains: list[str] = []
    # OIDC
    issuer: str | None = None
    client_id: str | None = None
    client_secret: str | None = None
    # SAML
    idp_metadata: str | None = None


# ─── Gestão de conexões (admin) ───────────────────────────────────────────────

def _serialize(conn: SSOConnection, slug: str) -> dict:
    return {
        "id": conn.id,
        "protocol": conn.protocol,
        "displayName": conn.display_name,
        "enabled": conn.enabled,
        "defaultRole": conn.default_role,
        "allowedDomains": conn.allowed_domains or [],
        "createdAt": conn.created_at.isoformat() if conn.created_at else None,
        # URLs que o admin cola no IdP
        "loginUrl": f"{API_BASE_URL}/api/sso/{slug}/{conn.protocol}/login",
        "callbackUrl": _oidc_redirect_uri() if conn.protocol == "oidc" else _saml_acs_url(),
        "metadataUrl": _saml_entity_id(slug) if conn.protocol == "saml" else None,
    }


@router.get("/connections")
def list_connections(token=Depends(get_current_user_and_company), db: Session = Depends(get_db_session)):
    if token.role != "admin":
        raise HTTPException(status_code=403, detail="Apenas administradores.")
    company = db.query(Company).filter(Company.id == token.company_id).first()
    slug = sso_service.ensure_slug(db, company)
    conns = db.query(SSOConnection).filter(SSOConnection.company_id == token.company_id).all()
    return {"success": True, "data": {"slug": slug, "connections": [_serialize(c, slug) for c in conns]}}


@router.post("/connections")
def create_connection(data: SSOConnectionCreate, token=Depends(get_current_user_and_company), db: Session = Depends(get_db_session)):
    if token.role != "admin":
        raise HTTPException(status_code=403, detail="Apenas administradores.")
    company = db.query(Company).filter(Company.id == token.company_id).first()
    PlanService.require_feature(company, "sso")

    if data.protocol not in ("oidc", "saml"):
        raise HTTPException(status_code=400, detail="Protocolo inválido (oidc|saml).")

    if data.protocol == "oidc":
        if not (data.issuer and data.client_id and data.client_secret):
            raise HTTPException(status_code=400, detail="OIDC exige issuer, client_id e client_secret.")
        config = {"issuer": data.issuer.rstrip("/"), "client_id": data.client_id, "client_secret": data.client_secret}
    else:
        if not data.idp_metadata:
            raise HTTPException(status_code=400, detail="SAML exige o metadata XML do IdP.")
        if not sso_service.saml_available():
            raise HTTPException(status_code=503, detail="SAML indisponível neste servidor (xmlsec1 ausente). Use OIDC.")
        config = {"idp_metadata": data.idp_metadata}

    conn = SSOConnection(
        company_id=token.company_id,
        protocol=data.protocol,
        display_name=data.display_name,
        default_role=data.default_role if data.default_role in ("admin", "analyst", "viewer") else "viewer",
        allowed_domains=[d.strip().lower() for d in data.allowed_domains if d.strip()],
        config=sso_service.encrypt_config(config),
    )
    db.add(conn)
    db.commit()
    db.refresh(conn)
    slug = sso_service.ensure_slug(db, company)
    audit_service.log_action(db, company_id=token.company_id, action="sso.connection_created",
                             user_id=token.user_id, resource_type="sso", resource_id=conn.id,
                             details={"protocol": conn.protocol})
    db.commit()
    return {"success": True, "data": _serialize(conn, slug)}


@router.post("/scim-token")
def create_scim_token(token=Depends(get_current_user_and_company), db: Session = Depends(get_db_session)):
    """Gera um token Bearer para provisionamento SCIM. Mostrado uma única vez."""
    import hashlib
    from app.domain.models import ScimToken
    if token.role != "admin":
        raise HTTPException(status_code=403, detail="Apenas administradores.")
    company = db.query(Company).filter(Company.id == token.company_id).first()
    PlanService.require_feature(company, "scim")

    # Revoga tokens anteriores (1 ativo por empresa para simplicidade).
    db.query(ScimToken).filter_by(company_id=token.company_id).delete()
    plaintext = f"scim_{secrets.token_urlsafe(32)}"
    rec = ScimToken(company_id=token.company_id, token_hash=hashlib.sha256(plaintext.encode()).hexdigest())
    db.add(rec)
    db.commit()
    audit_service.log_action(db, company_id=token.company_id, action="scim.token_created", user_id=token.user_id)
    db.commit()
    return {"success": True, "data": {
        "token": plaintext,
        "scimBaseUrl": f"{API_BASE_URL}/api/scim/v2",
    }}


@router.delete("/connections/{conn_id}")
def delete_connection(conn_id: str, token=Depends(get_current_user_and_company), db: Session = Depends(get_db_session)):
    if token.role != "admin":
        raise HTTPException(status_code=403, detail="Apenas administradores.")
    conn = db.query(SSOConnection).filter_by(id=conn_id, company_id=token.company_id).first()
    if not conn:
        raise HTTPException(status_code=404, detail="Conexão não encontrada.")
    db.delete(conn)
    db.commit()
    audit_service.log_action(db, company_id=token.company_id, action="sso.connection_deleted",
                             user_id=token.user_id, resource_type="sso", resource_id=conn_id)
    db.commit()
    return {"success": True}


# ─── Descoberta (público): por domínio de e-mail ──────────────────────────────

@router.get("/discover")
def discover(email: str, db: Session = Depends(get_db_session)):
    """Para o botão 'Entrar com SSO': dado um e-mail, descobre se há conexão SSO."""
    domain = email.strip().lower().split("@")[-1]
    if not domain:
        return {"success": True, "data": {"found": False}}
    conns = db.query(SSOConnection).filter(SSOConnection.enabled.is_(True)).all()
    for conn in conns:
        if domain in [d.lower() for d in (conn.allowed_domains or [])]:
            company = db.query(Company).filter(Company.id == conn.company_id).first()
            slug = sso_service.ensure_slug(db, company)
            return {"success": True, "data": {
                "found": True, "protocol": conn.protocol,
                "loginUrl": f"{API_BASE_URL}/api/sso/{slug}/{conn.protocol}/login",
                "displayName": conn.display_name,
            }}
    return {"success": True, "data": {"found": False}}


# ─── OIDC ─────────────────────────────────────────────────────────────────────

def _conn_for_slug(db: Session, slug: str, protocol: str) -> tuple[Company, SSOConnection]:
    company = db.query(Company).filter(Company.sso_slug == slug).first()
    if not company:
        raise HTTPException(status_code=404, detail="Empresa não encontrada.")
    conn = db.query(SSOConnection).filter_by(company_id=company.id, protocol=protocol, enabled=True).first()
    if not conn:
        raise HTTPException(status_code=404, detail=f"Conexão {protocol.upper()} não configurada.")
    return company, conn


@router.get("/{slug}/oidc/login")
@limiter.limit("20/minute")
def oidc_login(slug: str, request: Request, response: Response, db: Session = Depends(get_db_session)):
    company, conn = _conn_for_slug(db, slug, "oidc")
    state = secrets.token_urlsafe(24)
    nonce = secrets.token_urlsafe(16)
    try:
        redis_client.setex(f"{_STATE_PREFIX}{state}", _STATE_TTL, f"{conn.id}|{nonce}")
        url = sso_service.build_oidc_authorize_url(conn, _oidc_redirect_uri(), state, nonce)
    except Exception as exc:
        logger.error("sso.oidc.login_error", extra={"error": str(exc)})
        raise HTTPException(status_code=502, detail="Falha ao contatar o provedor de identidade.")
    return RedirectResponse(url)


@router.get("/oidc/callback")
def oidc_callback(request: Request, code: str = "", state: str = "", db: Session = Depends(get_db_session)):
    raw = None
    try:
        raw = redis_client.get(f"{_STATE_PREFIX}{state}")
        if isinstance(raw, bytes):
            raw = raw.decode()
    except Exception:
        pass
    if not raw or "|" not in raw:
        return RedirectResponse(f"{FRONTEND_URL}/login?sso_error=state")
    conn_id, nonce = raw.split("|", 1)
    redis_client.delete(f"{_STATE_PREFIX}{state}")

    conn = db.query(SSOConnection).filter_by(id=conn_id).first()
    if not conn:
        return RedirectResponse(f"{FRONTEND_URL}/login?sso_error=conn")
    company = db.query(Company).filter(Company.id == conn.company_id).first()

    try:
        claims = sso_service.exchange_oidc_code(conn, code, _oidc_redirect_uri(), nonce)
        user = sso_service.jit_provision(db, company, claims["email"], claims.get("name"), conn)
    except PermissionError as exc:
        return RedirectResponse(f"{FRONTEND_URL}/login?sso_error=forbidden&detail={exc}")
    except Exception as exc:
        logger.error("sso.oidc.callback_error", extra={"error": str(exc)})
        return RedirectResponse(f"{FRONTEND_URL}/login?sso_error=exchange")

    redirect = RedirectResponse(f"{FRONTEND_URL}/dashboard")
    issue_login(request, redirect, db, user, company)
    audit_service.log_action(db, company_id=company.id, action="auth.login",
                             user_id=user.id, user_name=user.name, details={"sso": "oidc"})
    db.commit()
    return redirect


# ─── SAML ─────────────────────────────────────────────────────────────────────

@router.get("/{slug}/saml/metadata")
def saml_metadata(slug: str, db: Session = Depends(get_db_session)):
    company, conn = _conn_for_slug(db, slug, "saml")
    try:
        xml = sso_service.sp_metadata_xml(conn, _saml_entity_id(slug), _saml_acs_url())
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    return Response(content=xml, media_type="application/xml")


@router.get("/{slug}/saml/login")
@limiter.limit("20/minute")
def saml_login(slug: str, request: Request, response: Response, db: Session = Depends(get_db_session)):
    company, conn = _conn_for_slug(db, slug, "saml")
    try:
        url = sso_service.saml_login_redirect(conn, _saml_entity_id(slug), _saml_acs_url(), relay_state=slug)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    return RedirectResponse(url)


@router.post("/saml/acs")
def saml_acs(request: Request, SAMLResponse: str = Form(...), RelayState: str = Form(""), db: Session = Depends(get_db_session)):
    slug = RelayState
    company, conn = _conn_for_slug(db, slug, "saml")
    try:
        info = sso_service.saml_parse_acs(conn, _saml_entity_id(slug), _saml_acs_url(), SAMLResponse)
        user = sso_service.jit_provision(db, company, info["email"], info.get("name"), conn)
    except PermissionError as exc:
        return RedirectResponse(f"{FRONTEND_URL}/login?sso_error=forbidden&detail={exc}", status_code=303)
    except Exception as exc:
        logger.error("sso.saml.acs_error", extra={"error": str(exc)})
        return RedirectResponse(f"{FRONTEND_URL}/login?sso_error=saml", status_code=303)

    redirect = RedirectResponse(f"{FRONTEND_URL}/dashboard", status_code=303)
    issue_login(request, redirect, db, user, company)
    audit_service.log_action(db, company_id=company.id, action="auth.login",
                             user_id=user.id, user_name=user.name, details={"sso": "saml"})
    db.commit()
    return redirect
