# app/api/carteira.py
import logging
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.auth import get_current_user_and_company
from app.domain.models import ComputedInsights, OpportunityAction, User
from app.infrastructure.database import get_db_session

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/carteira", tags=["Carteira"])

OpportunityStatus = Literal["to_contact", "contacted", "won", "lost"]


class UpsertActionRequest(BaseModel):
    opportunity_id: str
    customer_name: str
    expected_value: float
    status: OpportunityStatus
    notes: Optional[str] = None


@router.get("/{company_id}")
def list_carteira(
    company_id: str,
    status: Optional[str] = None,
    token_data=Depends(get_current_user_and_company),
    db: Session = Depends(get_db_session),
):
    """
    Returns all opportunities from ComputedInsights (1m) merged with the
    commercial actions of the calling user. Admins can additionally filter
    across all users via ?status=.
    """
    if token_data.company_id != company_id:
        raise HTTPException(status_code=403, detail="Acesso negado.")

    # Tenta carregar oportunidades em ordem de preferência de período.
    # Após o fix do ETL (churned usa df completo), "1m" já inclui todos os churned.
    # O fallback garante que mesmo datasets pequenos mostrem oportunidades.
    insights = None
    for dr in ("1m", "3m", "6m", "12m"):
        candidate = db.query(ComputedInsights).filter_by(
            company_id=company_id, date_range=dr
        ).first()
        if candidate and candidate.opportunities:
            insights = candidate
            break
    raw = insights.opportunities if insights else []

    actions = (
        db.query(OpportunityAction)
        .filter(
            OpportunityAction.company_id == company_id,
            OpportunityAction.user_id == token_data.user_id,
        )
        .all()
    )
    action_map = {a.opportunity_id: a for a in actions}

    result = []
    for opp in raw:
        opp_id = opp.get("customerHash", opp.get("id", ""))
        action = action_map.get(opp_id)
        opp_status = action.status if action else "to_contact"

        if status and opp_status != status:
            continue

        result.append({
            **opp,
            "action": {
                "status": opp_status,
                "notes": action.notes if action else None,
                "updatedAt": action.updated_at.isoformat() if action and action.updated_at else None,
            },
        })

    return {"success": True, "data": result}


@router.post("/{company_id}/actions")
def upsert_action(
    company_id: str,
    data: UpsertActionRequest,
    token_data=Depends(get_current_user_and_company),
    db: Session = Depends(get_db_session),
):
    if token_data.company_id != company_id:
        raise HTTPException(status_code=403, detail="Acesso negado.")

    if token_data.role not in ("admin", "analyst"):
        raise HTTPException(status_code=403, detail="Sem permissão para registrar ações comerciais.")

    existing = db.query(OpportunityAction).filter_by(
        company_id=company_id,
        user_id=token_data.user_id,
        opportunity_id=data.opportunity_id,
    ).first()

    if existing:
        existing.status = data.status
        existing.notes = data.notes
        existing.customer_name = data.customer_name
        existing.expected_value = data.expected_value
    else:
        db.add(OpportunityAction(
            company_id=company_id,
            user_id=token_data.user_id,
            opportunity_id=data.opportunity_id,
            customer_name=data.customer_name,
            expected_value=data.expected_value,
            status=data.status,
            notes=data.notes,
        ))

    db.commit()
    logger.info("carteira.action.upserted", extra={
        "company_id": company_id,
        "opportunity_id": data.opportunity_id,
        "status": data.status,
    })
    return {"success": True, "message": "Ação registrada com sucesso."}


@router.get("/{company_id}/ranking")
def get_ranking(
    company_id: str,
    token_data=Depends(get_current_user_and_company),
    db: Session = Depends(get_db_session),
):
    """
    Vendor conversion ranking. Admins see all; analysts see only themselves.
    """
    if token_data.company_id != company_id:
        raise HTTPException(status_code=403, detail="Acesso negado.")

    users = db.query(User).filter(
        User.company_id == company_id,
        User.role.in_(["admin", "analyst"]),
        User.status == "active",
    ).all()
    user_map = {u.id: u.name for u in users}

    actions = db.query(OpportunityAction).filter(
        OpportunityAction.company_id == company_id
    ).all()

    stats: dict = {}
    for a in actions:
        s = stats.setdefault(a.user_id, {
            "to_contact": 0, "contacted": 0, "won": 0, "lost": 0, "total_won_value": 0.0,
        })
        s[a.status] = s.get(a.status, 0) + 1
        if a.status == "won":
            s["total_won_value"] += a.expected_value or 0.0

    ranking = []
    for uid, s in stats.items():
        if uid not in user_map:
            continue
        actionable = s["contacted"] + s["won"] + s["lost"]
        conversion_rate = round(s["won"] / actionable * 100, 1) if actionable else 0.0
        ranking.append({
            "userId": uid,
            "userName": user_map[uid],
            "toContact": s["to_contact"],
            "contacted": s["contacted"],
            "won": s["won"],
            "lost": s["lost"],
            "totalWonValue": round(s["total_won_value"], 2),
            "conversionRate": conversion_rate,
        })

    ranking.sort(key=lambda x: x["won"], reverse=True)

    if token_data.role == "analyst":
        ranking = [r for r in ranking if r["user_id"] == token_data.user_id]

    return {"success": True, "data": ranking}
