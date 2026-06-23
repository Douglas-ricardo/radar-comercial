# app/api/roles.py
import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.auth import get_current_user_and_company
from app.core.permissions import PERMISSION_CATALOG, PRESETS, ALL_PERMISSIONS, require_permission
from app.domain.models import Role, User
from app.infrastructure.database import get_db_session
from app.services import audit_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/roles", tags=["Roles"])

_BASE_ROLES = {"admin", "analyst", "viewer"}


class RoleInput(BaseModel):
    name: str
    base_role: str = "viewer"
    permissions: list[str] = []


def _serialize(r: Role) -> dict:
    return {
        "id": r.id,
        "name": r.name,
        "baseRole": r.base_role,
        "permissions": r.permissions or [],
        "isSystem": r.is_system,
        "createdAt": r.created_at.isoformat() if r.created_at else None,
    }


@router.get("")
def list_roles(token=Depends(get_current_user_and_company), db: Session = Depends(get_db_session)):
    """Catálogo de permissões + presets legados + papéis customizados da empresa."""
    roles = db.query(Role).filter_by(company_id=token.company_id).order_by(Role.created_at).all()
    catalog = [{"key": k, "group": g, "label": label} for k, (g, label) in PERMISSION_CATALOG.items()]
    presets = {name: sorted(perms) for name, perms in PRESETS.items()}
    return {
        "success": True,
        "data": {"catalog": catalog, "presets": presets, "roles": [_serialize(r) for r in roles]},
    }


@router.post("")
def create_role(data: RoleInput, token=Depends(require_permission("roles.manage")), db: Session = Depends(get_db_session)):
    if data.base_role not in _BASE_ROLES:
        raise HTTPException(status_code=400, detail="base_role inválido (admin|analyst|viewer).")
    perms = [p for p in data.permissions if p in ALL_PERMISSIONS]
    role = Role(
        company_id=token.company_id,
        name=data.name.strip(),
        base_role=data.base_role,
        permissions=perms,
    )
    db.add(role)
    db.commit()
    db.refresh(role)
    audit_service.log_action(db, company_id=token.company_id, action="role.created",
                             user_id=token.user_id, resource_type="role", resource_id=role.id,
                             details={"name": role.name})
    db.commit()
    return {"success": True, "data": _serialize(role)}


@router.patch("/{role_id}")
def update_role(role_id: str, data: RoleInput, token=Depends(require_permission("roles.manage")), db: Session = Depends(get_db_session)):
    role = db.query(Role).filter_by(id=role_id, company_id=token.company_id).first()
    if not role:
        raise HTTPException(status_code=404, detail="Papel não encontrado.")
    if data.base_role not in _BASE_ROLES:
        raise HTTPException(status_code=400, detail="base_role inválido.")
    role.name = data.name.strip()
    role.base_role = data.base_role
    role.permissions = [p for p in data.permissions if p in ALL_PERMISSIONS]
    db.commit()
    audit_service.log_action(db, company_id=token.company_id, action="role.updated",
                             user_id=token.user_id, resource_type="role", resource_id=role.id)
    db.commit()
    return {"success": True, "data": _serialize(role)}


@router.delete("/{role_id}")
def delete_role(role_id: str, token=Depends(require_permission("roles.manage")), db: Session = Depends(get_db_session)):
    role = db.query(Role).filter_by(id=role_id, company_id=token.company_id).first()
    if not role:
        raise HTTPException(status_code=404, detail="Papel não encontrado.")
    # Usuários com este papel voltam ao preset do papel legado (role_id = NULL).
    db.query(User).filter_by(company_id=token.company_id, role_id=role_id).update({"role_id": None})
    db.delete(role)
    db.commit()
    audit_service.log_action(db, company_id=token.company_id, action="role.deleted",
                             user_id=token.user_id, resource_type="role", resource_id=role_id)
    db.commit()
    return {"success": True}
