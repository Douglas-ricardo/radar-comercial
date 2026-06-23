"""Serviço de SSO — OIDC (authlib.jose) e SAML 2.0 (pysaml2), + JIT provisioning.

OIDC funciona em qualquer ambiente (puro Python). SAML exige o binário `xmlsec1`
no servidor (verificação de assinatura); na ausência dele, as rotas SAML retornam
um erro claro — o OIDC continua disponível.
"""
import json
import logging
import re
import secrets
import shutil
import uuid

import httpx

from app.core import crypto
from app.core.security import get_password_hash
from app.domain.models import Company, SSOConnection, User
from app.services.plan_service import PlanService

logger = logging.getLogger(__name__)

_DISCOVERY_CACHE: dict[str, dict] = {}


# ─── Config (cifrado) ─────────────────────────────────────────────────────────

def encrypt_config(data: dict) -> str:
    return crypto.encrypt(json.dumps(data))


def decrypt_config(blob: str) -> dict:
    raw = crypto.decrypt(blob)
    return json.loads(raw) if raw else {}


# ─── Slug ─────────────────────────────────────────────────────────────────────

def ensure_slug(db, company: Company) -> str:
    """Garante um slug único para as URLs de SSO da empresa."""
    if company.sso_slug:
        return company.sso_slug
    base = re.sub(r"[^a-z0-9]+", "-", (company.name or "empresa").lower()).strip("-")[:24] or "empresa"
    slug = base
    while db.query(Company).filter(Company.sso_slug == slug).first():
        slug = f"{base}-{secrets.token_hex(2)}"
    company.sso_slug = slug
    db.commit()
    return slug


# ─── JIT provisioning ─────────────────────────────────────────────────────────

def jit_provision(db, company: Company, email: str, name: str | None, conn: SSOConnection) -> User:
    """Cria (ou retorna) o usuário a partir da identidade do IdP."""
    email = email.strip().lower()
    domain = email.split("@")[-1]
    allowed = [d.lower() for d in (conn.allowed_domains or [])]
    if allowed and domain not in allowed:
        raise PermissionError(f"Domínio '{domain}' não autorizado para SSO.")

    user = db.query(User).filter(User.email == email).first()
    if user:
        if user.company_id != company.id:
            raise PermissionError("E-mail já pertence a outra empresa.")
        if user.status == "disabled":
            raise PermissionError("Conta desativada.")
        return user

    current_count = db.query(User).filter(User.company_id == company.id).count()
    PlanService.check_user_limit(company, current_count)

    user = User(
        email=email,
        name=name or email.split("@")[0],
        hashed_password=get_password_hash(secrets.token_urlsafe(32)),
        role=conn.default_role or "viewer",
        status="active",
        company_id=company.id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    logger.info("sso.jit_provisioned", extra={"company_id": company.id, "user_id": user.id})
    return user


# ─── OIDC ─────────────────────────────────────────────────────────────────────

def _discovery(issuer: str) -> dict:
    issuer = issuer.rstrip("/")
    if issuer in _DISCOVERY_CACHE:
        return _DISCOVERY_CACHE[issuer]
    url = f"{issuer}/.well-known/openid-configuration"
    doc = httpx.get(url, timeout=10).raise_for_status().json()
    _DISCOVERY_CACHE[issuer] = doc
    return doc


def build_oidc_authorize_url(conn: SSOConnection, redirect_uri: str, state: str, nonce: str) -> str:
    cfg = decrypt_config(conn.config)
    disc = _discovery(cfg["issuer"])
    params = {
        "client_id": cfg["client_id"],
        "response_type": "code",
        "scope": "openid email profile",
        "redirect_uri": redirect_uri,
        "state": state,
        "nonce": nonce,
    }
    from urllib.parse import urlencode
    return f"{disc['authorization_endpoint']}?{urlencode(params)}"


def exchange_oidc_code(conn: SSOConnection, code: str, redirect_uri: str, nonce: str) -> dict:
    """Troca o code por tokens, valida o id_token e retorna os claims (email, name)."""
    cfg = decrypt_config(conn.config)
    disc = _discovery(cfg["issuer"])
    resp = httpx.post(disc["token_endpoint"], data={
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": redirect_uri,
        "client_id": cfg["client_id"],
        "client_secret": cfg["client_secret"],
    }, timeout=10)
    resp.raise_for_status()
    tokens = resp.json()
    id_token = tokens.get("id_token")
    if not id_token:
        raise ValueError("IdP não retornou id_token.")

    from authlib.jose import jwt, JsonWebKey
    jwks = httpx.get(disc["jwks_uri"], timeout=10).raise_for_status().json()
    key_set = JsonWebKey.import_key_set(jwks)
    claims = jwt.decode(id_token, key_set)
    claims.validate()  # exp/iat
    if nonce and claims.get("nonce") and claims["nonce"] != nonce:
        raise ValueError("Nonce inválido.")
    email = claims.get("email")
    if not email:
        raise ValueError("id_token sem e-mail.")
    return {"email": email, "name": claims.get("name") or claims.get("preferred_username")}


# ─── SAML (pysaml2; requer xmlsec1) ───────────────────────────────────────────

def saml_available() -> bool:
    return shutil.which("xmlsec1") is not None


def _saml_client(conn: SSOConnection, sp_entity_id: str, acs_url: str):
    if not saml_available():
        raise RuntimeError("SAML indisponível: binário xmlsec1 não instalado no servidor.")
    from saml2 import BINDING_HTTP_POST, BINDING_HTTP_REDIRECT
    from saml2.client import Saml2Client
    from saml2.config import Config as Saml2Config

    cfg = decrypt_config(conn.config)
    settings = {
        "entityid": sp_entity_id,
        "metadata": {"inline": [cfg["idp_metadata"]]},
        "service": {
            "sp": {
                "endpoints": {"assertion_consumer_service": [(acs_url, BINDING_HTTP_POST)]},
                "allow_unsolicited": True,
                "authn_requests_signed": False,
                "want_assertions_signed": True,
                "want_response_signed": False,
            }
        },
        "allow_unknown_attributes": True,
    }
    c = Saml2Config()
    c.load(settings)
    return Saml2Client(config=c)


def saml_login_redirect(conn: SSOConnection, sp_entity_id: str, acs_url: str, relay_state: str) -> str:
    client = _saml_client(conn, sp_entity_id, acs_url)
    reqid, info = client.prepare_for_authenticate(relay_state=relay_state)
    for k, v in info["headers"]:
        if k == "Location":
            return v
    raise RuntimeError("Falha ao montar AuthnRequest SAML.")


def saml_parse_acs(conn: SSOConnection, sp_entity_id: str, acs_url: str, saml_response: str) -> dict:
    from saml2 import BINDING_HTTP_POST
    client = _saml_client(conn, sp_entity_id, acs_url)
    authn = client.parse_authn_request_response(saml_response, BINDING_HTTP_POST)
    identity = authn.get_identity() or {}
    email = (authn.get_subject().text if authn.get_subject() else None)
    # email costuma vir no NameID ou num atributo
    for key in ("email", "mail", "emailAddress", "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress"):
        if key in identity and identity[key]:
            email = identity[key][0]
            break
    name = None
    for key in ("displayName", "name", "givenName", "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name"):
        if key in identity and identity[key]:
            name = identity[key][0]
            break
    if not email:
        raise ValueError("Assertion SAML sem e-mail.")
    return {"email": email, "name": name}


def sp_metadata_xml(conn: SSOConnection, sp_entity_id: str, acs_url: str) -> str:
    from saml2.metadata import entity_descriptor
    client = _saml_client(conn, sp_entity_id, acs_url)
    return str(entity_descriptor(client.config))
