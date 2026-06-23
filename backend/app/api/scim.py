# app/api/scim.py
"""SCIM 2.0 (subset) — provisionamento automático de usuários por IdP (Okta/Azure AD).

Autenticado por token Bearer (ScimToken). Mapeia o recurso SCIM User → modelo User:
userName→email, name→name, active=false→desativa (revoga sessões + bloqueia login).
"""
import hashlib
import logging

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response
from sqlalchemy.orm import Session

from app.core.clock import utcnow
from app.core.security import get_password_hash
from app.domain.models import Company, ScimToken, User
from app.infrastructure.database import get_db_session
from app.services import audit_service
from app.services.plan_service import PlanService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/scim/v2", tags=["SCIM"])

_USER_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:User"
_LIST_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:ListResponse"


def scim_company(authorization: str = Header(None), db: Session = Depends(get_db_session)) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Token SCIM ausente.")
    token = authorization[7:]
    h = hashlib.sha256(token.encode()).hexdigest()
    rec = db.query(ScimToken).filter_by(token_hash=h).first()
    if not rec:
        raise HTTPException(status_code=401, detail="Token SCIM inválido.")
    rec.last_used_at = utcnow()
    db.commit()
    return rec.company_id


def _to_scim(user: User) -> dict:
    parts = (user.name or "").split(" ", 1)
    given = parts[0]
    family = parts[1] if len(parts) > 1 else ""
    return {
        "schemas": [_USER_SCHEMA],
        "id": user.id,
        "userName": user.email,
        "name": {"givenName": given, "familyName": family, "formatted": user.name},
        "emails": [{"value": user.email, "primary": True}],
        "active": user.status != "disabled",
        "meta": {"resourceType": "User"},
    }


@router.get("/Users")
def list_users(request: Request, filter: str | None = None, company_id: str = Depends(scim_company), db: Session = Depends(get_db_session)):
    q = db.query(User).filter(User.company_id == company_id)
    # Suporta filtro do tipo: userName eq "alice@x.com"
    if filter and "eq" in filter:
        try:
            value = filter.split("eq", 1)[1].strip().strip('"')
            q = q.filter(User.email == value.lower())
        except Exception:
            pass
    users = q.all()
    return {
        "schemas": [_LIST_SCHEMA],
        "totalResults": len(users),
        "startIndex": 1,
        "itemsPerPage": len(users),
        "Resources": [_to_scim(u) for u in users],
    }


@router.get("/Users/{user_id}")
def get_user(user_id: str, company_id: str = Depends(scim_company), db: Session = Depends(get_db_session)):
    user = db.query(User).filter_by(id=user_id, company_id=company_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return _to_scim(user)


@router.post("/Users", status_code=201)
async def create_user(request: Request, company_id: str = Depends(scim_company), db: Session = Depends(get_db_session)):
    body = await request.json()
    email = (body.get("userName") or "").strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="userName obrigatório.")

    existing = db.query(User).filter(User.email == email).first()
    if existing:
        # Idempotência SCIM: se já existe na empresa, reativa e devolve.
        if existing.company_id == company_id:
            existing.status = "active"
            db.commit()
            return _to_scim(existing)
        raise HTTPException(status_code=409, detail="userName já existe.")

    company = db.query(Company).filter(Company.id == company_id).first()
    current = db.query(User).filter(User.company_id == company_id).count()
    PlanService.check_user_limit(company, current)

    name_obj = body.get("name") or {}
    full_name = name_obj.get("formatted") or " ".join(
        p for p in [name_obj.get("givenName"), name_obj.get("familyName")] if p
    ) or email.split("@")[0]

    import secrets as _secrets
    user = User(
        email=email,
        name=full_name,
        hashed_password=get_password_hash(_secrets.token_urlsafe(32)),
        role="viewer",
        status="active",
        company_id=company_id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    audit_service.log_action(db, company_id=company_id, action="scim.user_created", resource_type="user", resource_id=user.id, details={"email": email})
    db.commit()
    return _to_scim(user)


def _set_active(db: Session, user: User, active: bool):
    if active:
        user.status = "active"
    else:
        # Desativa: bloqueia login e revoga todas as sessões (bump de credential_version).
        user.status = "disabled"
        user.credential_version = (user.credential_version or 0) + 1
    db.commit()


@router.patch("/Users/{user_id}")
async def patch_user(user_id: str, request: Request, company_id: str = Depends(scim_company), db: Session = Depends(get_db_session)):
    user = db.query(User).filter_by(id=user_id, company_id=company_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    body = await request.json()
    for op in body.get("Operations", []):
        path = (op.get("path") or "").lower()
        value = op.get("value")
        if path == "active" or (isinstance(value, dict) and "active" in value):
            active = value if isinstance(value, bool) else value.get("active")
            _set_active(db, user, bool(active))
    action = "scim.user_activated" if user.status == "active" else "scim.user_deactivated"
    audit_service.log_action(db, company_id=company_id, action=action, resource_type="user", resource_id=user.id)
    db.commit()
    return _to_scim(user)


@router.put("/Users/{user_id}")
async def replace_user(user_id: str, request: Request, company_id: str = Depends(scim_company), db: Session = Depends(get_db_session)):
    user = db.query(User).filter_by(id=user_id, company_id=company_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    body = await request.json()
    name_obj = body.get("name") or {}
    full_name = name_obj.get("formatted") or " ".join(
        p for p in [name_obj.get("givenName"), name_obj.get("familyName")] if p
    )
    if full_name:
        user.name = full_name
    if "active" in body:
        _set_active(db, user, bool(body["active"]))
    db.commit()
    return _to_scim(user)


@router.delete("/Users/{user_id}", status_code=204)
def delete_user(user_id: str, company_id: str = Depends(scim_company), db: Session = Depends(get_db_session)):
    user = db.query(User).filter_by(id=user_id, company_id=company_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    # Soft-delete: desativa em vez de remover (preserva histórico/auditoria).
    _set_active(db, user, False)
    audit_service.log_action(db, company_id=company_id, action="scim.user_deleted", resource_type="user", resource_id=user.id)
    db.commit()
    return Response(status_code=204)
