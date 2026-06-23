# app/api/saved_views.py
import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.auth import get_current_user_and_company
from app.domain.models import SavedView
from app.infrastructure.database import get_db_session

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/saved-views", tags=["SavedViews"])

_PAGES = {"carteira", "insights", "dashboard"}


class SavedViewInput(BaseModel):
    name: str
    page: str
    config: dict = {}


def _serialize(v: SavedView) -> dict:
    return {
        "id": v.id,
        "name": v.name,
        "page": v.page,
        "config": v.config or {},
        "createdAt": v.created_at.isoformat() if v.created_at else None,
    }


@router.get("")
def list_views(
    page: str | None = Query(default=None),
    token=Depends(get_current_user_and_company),
    db: Session = Depends(get_db_session),
):
    """Visões salvas do usuário atual (opcionalmente filtradas por página)."""
    q = db.query(SavedView).filter_by(company_id=token.company_id, user_id=token.user_id)
    if page:
        q = q.filter(SavedView.page == page)
    views = q.order_by(SavedView.created_at.desc()).all()
    return {"success": True, "data": [_serialize(v) for v in views]}


@router.post("")
def create_view(data: SavedViewInput, token=Depends(get_current_user_and_company), db: Session = Depends(get_db_session)):
    if data.page not in _PAGES:
        raise HTTPException(status_code=400, detail=f"Página inválida. Use: {', '.join(_PAGES)}.")
    if not data.name.strip():
        raise HTTPException(status_code=400, detail="Nome obrigatório.")
    view = SavedView(
        company_id=token.company_id,
        user_id=token.user_id,
        name=data.name.strip(),
        page=data.page,
        config=data.config,
    )
    db.add(view)
    db.commit()
    db.refresh(view)
    return {"success": True, "data": _serialize(view)}


@router.delete("/{view_id}")
def delete_view(view_id: str, token=Depends(get_current_user_and_company), db: Session = Depends(get_db_session)):
    view = db.query(SavedView).filter_by(id=view_id, company_id=token.company_id, user_id=token.user_id).first()
    if not view:
        raise HTTPException(status_code=404, detail="Visão não encontrada.")
    db.delete(view)
    db.commit()
    return {"success": True}
