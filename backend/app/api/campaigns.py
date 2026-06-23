# app/api/campaigns.py
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.auth import get_current_user_and_company, require_analyst_or_above
from app.domain.models import Campaign
from app.infrastructure.database import get_db_session
from app.services.audit_service import log_action

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/campaigns", tags=["Campaigns"])


class CampaignCreate(BaseModel):
    name: str
    segment: Optional[str] = None    # "at_risk" | "lost" | null (todos)
    branch: Optional[str] = None
    salesperson: Optional[str] = None
    message_content: str


def _serialize(c: Campaign) -> dict:
    return {
        "id": c.id,
        "name": c.name,
        "segment": c.segment,
        "branch": c.branch,
        "salesperson": c.salesperson,
        "messageContent": c.message_content,
        "status": c.status,
        "targetCount": c.target_count,
        "sentCount": c.sent_count,
        "createdAt": c.created_at.isoformat() if c.created_at else None,
        "sentAt": c.sent_at.isoformat() if c.sent_at else None,
    }


@router.get("/{company_id}")
def list_campaigns(
    company_id: str,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    token=Depends(require_analyst_or_above),
    db: Session = Depends(get_db_session),
):
    if str(token.company_id) != company_id:
        raise HTTPException(status_code=403, detail="Acesso negado.")
    total = db.query(Campaign).filter_by(company_id=company_id).count()
    campaigns = (
        db.query(Campaign)
        .filter_by(company_id=company_id)
        .order_by(Campaign.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return {
        "success": True,
        "data": [_serialize(c) for c in campaigns],
        "pagination": {"total": total, "limit": limit, "offset": offset},
    }


@router.post("/{company_id}")
def create_campaign(
    company_id: str,
    data: CampaignCreate,
    token=Depends(get_current_user_and_company),
    db: Session = Depends(get_db_session),
):
    if str(token.company_id) != company_id:
        raise HTTPException(status_code=403, detail="Acesso negado.")
    if token.role not in ("admin", "analyst"):
        raise HTTPException(status_code=403, detail="Sem permissão.")
    if not data.message_content.strip():
        raise HTTPException(status_code=400, detail="Conteúdo da mensagem não pode ser vazio.")

    c = Campaign(
        company_id=company_id,
        name=data.name.strip(),
        segment=data.segment or None,
        branch=data.branch or None,
        salesperson=data.salesperson or None,
        message_content=data.message_content.strip(),
        status="draft",
    )
    db.add(c)
    db.commit()
    db.refresh(c)

    log_action(
        db, company_id=company_id,
        action="campaign.created",
        user_id=token.user_id, user_name=getattr(token, "name", None),
        resource_type="campaign", resource_id=c.id,
        details={"name": c.name, "segment": c.segment},
    )
    db.commit()
    return {"success": True, "data": _serialize(c)}


@router.post("/{company_id}/{campaign_id}/send")
def send_campaign(
    company_id: str,
    campaign_id: str,
    token=Depends(get_current_user_and_company),
    db: Session = Depends(get_db_session),
):
    if str(token.company_id) != company_id:
        raise HTTPException(status_code=403, detail="Acesso negado.")
    if token.role not in ("admin", "analyst"):
        raise HTTPException(status_code=403, detail="Sem permissão.")

    c = db.query(Campaign).filter_by(id=campaign_id, company_id=company_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Campanha não encontrada.")
    if c.status not in ("draft", "failed"):
        raise HTTPException(status_code=409, detail=f"Campanha já foi processada (status: {c.status}).")

    from app.workers.campaign_tasks import run_campaign_task
    run_campaign_task.delay(campaign_id)

    log_action(
        db, company_id=company_id,
        action="campaign.dispatched",
        user_id=token.user_id, user_name=getattr(token, "name", None),
        resource_type="campaign", resource_id=campaign_id,
        details={"name": c.name},
    )
    db.commit()
    return {"success": True, "data": {"queued": True, "message": "Campanha enfileirada para disparo."}}


@router.delete("/{company_id}/{campaign_id}")
def delete_campaign(
    company_id: str,
    campaign_id: str,
    token=Depends(get_current_user_and_company),
    db: Session = Depends(get_db_session),
):
    if str(token.company_id) != company_id:
        raise HTTPException(status_code=403, detail="Acesso negado.")
    if token.role != "admin":
        raise HTTPException(status_code=403, detail="Apenas administradores podem deletar campanhas.")
    c = db.query(Campaign).filter_by(id=campaign_id, company_id=company_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Campanha não encontrada.")
    if c.status == "sending":
        raise HTTPException(status_code=409, detail="Não é possível deletar uma campanha em andamento.")
    db.delete(c)
    db.commit()
    return {"success": True}
