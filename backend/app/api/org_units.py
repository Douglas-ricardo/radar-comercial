# app/api/org_units.py
import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.auth import get_current_user_and_company
from app.core.permissions import require_permission
from app.domain.models import OrgUnit, User
from app.infrastructure.database import get_db_session
from app.services import audit_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/org-units", tags=["OrgUnits"])

_TYPES = {"region", "branch", "team"}


class OrgUnitInput(BaseModel):
    name: str
    type: str = "branch"
    parent_id: str | None = None


def _serialize(u: OrgUnit) -> dict:
    return {
        "id": u.id,
        "name": u.name,
        "type": u.type,
        "parentId": u.parent_id,
        "createdAt": u.created_at.isoformat() if u.created_at else None,
    }


@router.get("")
def list_units(token=Depends(get_current_user_and_company), db: Session = Depends(get_db_session)):
    """Lista plana das unidades (o frontend monta a árvore via parentId)."""
    units = db.query(OrgUnit).filter_by(company_id=token.company_id).order_by(OrgUnit.created_at).all()
    return {"success": True, "data": [_serialize(u) for u in units]}


@router.post("")
def create_unit(data: OrgUnitInput, token=Depends(require_permission("org.manage")), db: Session = Depends(get_db_session)):
    if data.type not in _TYPES:
        raise HTTPException(status_code=400, detail="Tipo inválido (region|branch|team).")
    if data.parent_id:
        parent = db.query(OrgUnit).filter_by(id=data.parent_id, company_id=token.company_id).first()
        if not parent:
            raise HTTPException(status_code=400, detail="Unidade pai não encontrada.")
    unit = OrgUnit(
        company_id=token.company_id,
        name=data.name.strip(),
        type=data.type,
        parent_id=data.parent_id,
    )
    db.add(unit)
    db.commit()
    db.refresh(unit)
    audit_service.log_action(db, company_id=token.company_id, action="org_unit.created",
                             user_id=token.user_id, resource_type="org_unit", resource_id=unit.id,
                             details={"name": unit.name, "type": unit.type})
    db.commit()
    return {"success": True, "data": _serialize(unit)}


@router.patch("/{unit_id}")
def update_unit(unit_id: str, data: OrgUnitInput, token=Depends(require_permission("org.manage")), db: Session = Depends(get_db_session)):
    unit = db.query(OrgUnit).filter_by(id=unit_id, company_id=token.company_id).first()
    if not unit:
        raise HTTPException(status_code=404, detail="Unidade não encontrada.")
    if data.type not in _TYPES:
        raise HTTPException(status_code=400, detail="Tipo inválido.")
    if data.parent_id == unit_id:
        raise HTTPException(status_code=400, detail="Unidade não pode ser pai de si mesma.")
    unit.name = data.name.strip()
    unit.type = data.type
    unit.parent_id = data.parent_id
    db.commit()
    return {"success": True, "data": _serialize(unit)}


@router.delete("/{unit_id}")
def delete_unit(unit_id: str, token=Depends(require_permission("org.manage")), db: Session = Depends(get_db_session)):
    unit = db.query(OrgUnit).filter_by(id=unit_id, company_id=token.company_id).first()
    if not unit:
        raise HTTPException(status_code=404, detail="Unidade não encontrada.")
    # Filhos sobem um nível (reparent ao pai do removido); usuários perdem a atribuição.
    db.query(OrgUnit).filter_by(company_id=token.company_id, parent_id=unit_id).update({"parent_id": unit.parent_id})
    db.query(User).filter_by(company_id=token.company_id, org_unit_id=unit_id).update({"org_unit_id": None})
    db.delete(unit)
    db.commit()
    audit_service.log_action(db, company_id=token.company_id, action="org_unit.deleted",
                             user_id=token.user_id, resource_type="org_unit", resource_id=unit_id)
    db.commit()
    return {"success": True}
