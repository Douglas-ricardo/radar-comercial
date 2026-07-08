# app/api/carteira.py
import logging
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.auth import get_current_user_and_company
from app.core.permissions import visible_branches
from app.domain.models import ComputedInsights, CustomerProfile, OpportunityAction, SalesTarget, User
from app.infrastructure.database import get_db_session
from app.services import metrics_service
from app.services.live_recency import refresh_days_inactive, live_recency_days, company_dataset_max

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/carteira", tags=["Carteira"])

OpportunityStatus = Literal["to_contact", "contacted", "won", "lost"]


def _allowed_branches(db: Session, token_data, branch_param: str | None) -> set[str] | None:
    """Conjunto de filiais visíveis ao usuário (territorialização). None = sem restrição.
    Prioridade: unidade organizacional (subárvore) > scope legado 'branch:X'.
    O parâmetro branch= estreita dentro do permitido (e é livre para admin)."""
    allowed: set[str] | None = None
    if token_data.role != "admin":
        vb = visible_branches(db, token_data.company_id, token_data.org_unit_id)
        if vb is not None:
            allowed = vb
        elif token_data.scope:
            parts = token_data.scope.split(":", 1)
            if parts[0] == "branch" and len(parts) == 2:
                allowed = {parts[1]}
    if branch_param:
        allowed = {branch_param} if allowed is None else (allowed & {branch_param})
    return allowed


class UpsertActionRequest(BaseModel):
    opportunity_id: str
    customer_name: str
    expected_value: float
    status: OpportunityStatus
    notes: Optional[str] = None
    channel: Optional[str] = None  # whatsapp | email | call | in_person | other


class SalesTargetRequest(BaseModel):
    key_type: str   # "branch" | "salesperson" | "company"
    key_value: Optional[str] = None
    period: str     # "month" | "quarter" | "year"
    target_won: Optional[int] = None
    target_value: Optional[float] = None


@router.get("/{company_id}")
def list_carteira(
    company_id: str,
    status: Optional[str] = None,
    branch: Optional[str] = None,
    salesperson: Optional[str] = None,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    token_data=Depends(get_current_user_and_company),
    db: Session = Depends(get_db_session),
):
    """
    Returns all opportunities from ComputedInsights (1m) merged with the
    commercial actions of the calling user. Supports filtering by branch,
    salesperson, and status. Users with scope are auto-filtered to their branch.
    """
    if token_data.company_id != company_id:
        raise HTTPException(status_code=403, detail="Acesso negado.")

    # Restrição territorial: unidade organizacional (subárvore) tem prioridade;
    # senão cai no scope legado "branch:X". Admin não é restrito (a menos que filtre).
    allowed_branches = _allowed_branches(db, token_data, branch)

    # Mapa customerHash → (branch, salesperson) para filtro por esses campos.
    # Consultado só se filtro está ativo (evita query desnecessária).
    scope_hashes: set | None = None
    if allowed_branches is not None or salesperson:
        q = db.query(CustomerProfile.customer_hash).filter(
            CustomerProfile.company_id == company_id
        )
        if allowed_branches is not None:
            q = q.filter(CustomerProfile.branch.in_(allowed_branches))
        if salesperson:
            q = q.filter(CustomerProfile.salesperson == salesperson)
        scope_hashes = {row[0] for row in q.all()}

    # Tenta carregar oportunidades em ordem de preferência de período.
    insights = None
    for dr in ("1m", "3m", "6m", "12m"):
        candidate = db.query(ComputedInsights).filter_by(
            company_id=company_id, date_range=dr
        ).first()
        if candidate and candidate.opportunities:
            insights = candidate
            break
    # Recência viva (gated por frescor) — consistente com o dashboard, senão a
    # Carteira mostraria os dias congelados enquanto o dashboard tica.
    raw = refresh_days_inactive(insights.opportunities, company_dataset_max(db, company_id)) if insights else []

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

        # Filtro por scope de filial/vendedor
        if scope_hashes is not None and opp_id not in scope_hashes:
            continue

        action = action_map.get(opp_id)
        opp_status = action.status if action else "to_contact"

        if status and opp_status != status:
            continue

        result.append({
            **opp,
            "action": {
                "status": opp_status,
                "notes": action.notes if action else None,
                "channel": action.channel if action else None,
                "updatedAt": action.updated_at.isoformat() if action and action.updated_at else None,
            },
        })

    # ── Ações "fora da base atual" ────────────────────────────────────────────
    # O cliente saiu da base (re-upload substituiu os perfis), mas a ação comercial
    # do vendedor (won/lost/notas) segue no banco. Sem isso, o histórico da Carteira
    # SOME da tela. Exibimos como órfã (outOfBase) para não perder o registro.
    # São ações do próprio usuário (já filtradas por user_id) → sem vazamento.
    base_hashes = {opp.get("customerHash", opp.get("id", "")) for opp in raw}
    for a in actions:
        if a.opportunity_id in base_hashes:
            continue
        if status and a.status != status:
            continue
        result.append({
            "id": a.opportunity_id,
            "customerHash": a.opportunity_id,
            "customer": a.customer_name or "Cliente sem nome",
            "product": None,
            "type": "missing_sale",
            "lastPurchase": None,
            "frequency": None,
            "expectedValue": a.expected_value or 0.0,
            "confidence": "low",
            "daysInactive": 0,
            "outOfBase": True,
            "action": {
                "status": a.status,
                "notes": a.notes,
                "channel": a.channel,
                "updatedAt": a.updated_at.isoformat() if a.updated_at else None,
            },
        })

    total = len(result)
    page = result[offset: offset + limit]
    return {"success": True, "data": page, "pagination": {"total": total, "limit": limit, "offset": offset}}


_CUSTOMER_SORTS = {
    "value": (CustomerProfile.expected_value, True),
    "revenue": (CustomerProfile.total_revenue, True),
    "recency": (CustomerProfile.recency_days, True),
    "recovery": (CustomerProfile.recovery_score, True),
    "name": (CustomerProfile.customer_name, False),
}


@router.get("/{company_id}/customers")
def list_all_customers(
    company_id: str,
    search: Optional[str] = None,
    segment: Optional[str] = None,          # champion|loyal|at_risk|lost|new
    status: Optional[str] = None,           # active|at_risk|churned
    recovery: Optional[str] = None,         # alta|media|baixa
    action_status: Optional[str] = None,    # to_contact|contacted|won|lost|none
    has_contact: Optional[bool] = None,
    branch: Optional[str] = None,
    salesperson: Optional[str] = None,
    sort: str = "value",
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    token_data=Depends(get_current_user_and_company),
    db: Session = Depends(get_db_session),
):
    """
    Base COMPLETA de clientes (todos os perfis, não só oportunidades) para análise
    e controle na Carteira. Filtros: busca por nome, segmento, status comercial,
    faixa de recuperabilidade, status da ação, com/sem contato, filial, vendedor.
    Recência viva (gated por frescor). Merge com a ação comercial do usuário.
    """
    if token_data.company_id != company_id:
        raise HTTPException(status_code=403, detail="Acesso negado.")

    allowed_branches = _allowed_branches(db, token_data, branch)

    q = db.query(CustomerProfile).filter(CustomerProfile.company_id == company_id)
    if allowed_branches is not None:
        q = q.filter(CustomerProfile.branch.in_(allowed_branches))
    if salesperson:
        q = q.filter(CustomerProfile.salesperson == salesperson)
    if search:
        q = q.filter(CustomerProfile.customer_name.ilike(f"%{search.strip()}%"))
    if segment:
        q = q.filter(CustomerProfile.segment == segment)
    if status:
        q = q.filter(CustomerProfile.status == status)
    if recovery:
        q = q.filter(CustomerProfile.recovery_band == recovery)
    if has_contact is True:
        q = q.filter(or_(CustomerProfile.phone.isnot(None), CustomerProfile.email.isnot(None)))
    elif has_contact is False:
        q = q.filter(CustomerProfile.phone.is_(None), CustomerProfile.email.is_(None))

    col, desc = _CUSTOMER_SORTS.get(sort, _CUSTOMER_SORTS["value"])
    q = q.order_by(col.desc() if desc else col.asc())

    profiles = q.all()

    # Ações do usuário → mapa por customer_hash (mesma semântica do funil).
    actions = {
        a.opportunity_id: a
        for a in db.query(OpportunityAction).filter_by(
            company_id=company_id, user_id=token_data.user_id
        ).all()
    }

    dataset_max = company_dataset_max(db, company_id)
    rows = []
    for p in profiles:
        act = actions.get(p.customer_hash)
        act_status = act.status if act else "none"
        if action_status and act_status != action_status:
            continue
        rows.append({
            "customerHash": p.customer_hash,
            "customer": p.customer_name,
            "segment": p.segment,
            "status": p.status,
            "lastPurchase": p.last_purchase_date,
            "daysInactive": live_recency_days(p.last_purchase_date, p.recency_days, dataset_max),
            "expectedValue": p.expected_value or 0.0,
            "totalRevenue": p.total_revenue or 0.0,
            "recoveryScore": p.recovery_score or 0,
            "recoveryBand": p.recovery_band,
            "hasPhone": bool(p.phone),
            "hasEmail": bool(p.email),
            "branch": p.branch,
            "salesperson": p.salesperson,
            "action": {
                "status": act_status,
                "notes": act.notes if act else None,
                "channel": act.channel if act else None,
                "updatedAt": act.updated_at.isoformat() if act and act.updated_at else None,
            },
        })

    total = len(rows)
    page = rows[offset: offset + limit]
    return {"success": True, "data": page, "pagination": {"total": total, "limit": limit, "offset": offset}}


@router.get("/{company_id}/metrics")
def get_metrics(
    company_id: str,
    branch: Optional[str] = None,
    salesperson: Optional[str] = None,
    token_data=Depends(get_current_user_and_company),
    db: Session = Depends(get_db_session),
):
    """Métricas de RESULTADO (fonte única) — recuperado, conversão, captura, em risco.

    Mesmo recorte territorial da listagem da carteira. Dashboard e carteira consomem
    daqui, garantindo que o MESMO estado produza os MESMOS números nas duas telas.
    """
    if token_data.company_id != company_id:
        raise HTTPException(status_code=403, detail="Acesso negado.")

    allowed_branches = _allowed_branches(db, token_data, branch)
    scope_hashes: set | None = None
    if allowed_branches is not None or salesperson:
        q = db.query(CustomerProfile.customer_hash).filter(
            CustomerProfile.company_id == company_id
        )
        if allowed_branches is not None:
            q = q.filter(CustomerProfile.branch.in_(allowed_branches))
        if salesperson:
            q = q.filter(CustomerProfile.salesperson == salesperson)
        scope_hashes = {row[0] for row in q.all()}

    data = metrics_service.company_result_metrics(db, company_id, scope_hashes)
    return {"success": True, "data": data}


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

    previous_status = existing.status if existing else None

    if existing:
        existing.status = data.status
        existing.notes = data.notes
        existing.customer_name = data.customer_name
        existing.expected_value = data.expected_value
        if data.channel is not None:
            existing.channel = data.channel
    else:
        db.add(OpportunityAction(
            company_id=company_id,
            user_id=token_data.user_id,
            opportunity_id=data.opportunity_id,
            customer_name=data.customer_name,
            expected_value=data.expected_value,
            status=data.status,
            notes=data.notes,
            channel=data.channel,
        ))

    db.commit()
    logger.info("carteira.action.upserted", extra={
        "company_id": company_id,
        "opportunity_id": data.opportunity_id,
        "status": data.status,
    })

    # Disparo assíncrono de webhook de saída (não bloqueia resposta).
    try:
        from app.services.webhook_service import dispatch_webhook
        dispatch_webhook(db, company_id, "opportunity.updated", {
            "opportunity_id": data.opportunity_id,
            "customer_name": data.customer_name,
            "previous_status": previous_status,
            "new_status": data.status,
            "expected_value": data.expected_value,
        })
    except Exception as exc:
        logger.warning("carteira.webhook.dispatch_error", extra={"company_id": company_id, "error": str(exc)})

    # Push ao CRM quando o negócio é fechado (ganho/perdido).
    if data.status in ("won", "lost"):
        try:
            from app.domain.models import CrmConnection
            has_crm = db.query(CrmConnection).filter_by(
                company_id=company_id, enabled=True, push_enabled=True
            ).first()
            if has_crm:
                from app.workers.crm_tasks import push_crm_deal
                push_crm_deal.delay(company_id, {
                    "customer_name": data.customer_name,
                    "new_status": data.status,
                    "expected_value": data.expected_value,
                })
        except Exception as exc:
            logger.warning("carteira.crm.push_error", extra={"company_id": company_id, "error": str(exc)})

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
        # Fonte única da fórmula de conversão (Decisão B). None → 0.0 na exibição
        # do ranking (vendedor sem deals trabalhados aparece com 0%).
        conv = metrics_service.conversion_rate(s["won"], s["contacted"], s["lost"])
        ranking.append({
            "userId": uid,
            "userName": user_map[uid],
            "toContact": s["to_contact"],
            "contacted": s["contacted"],
            "won": s["won"],
            "lost": s["lost"],
            "totalWonValue": round(s["total_won_value"], 2),
            "conversionRate": conv if conv is not None else 0.0,
        })

    ranking.sort(key=lambda x: x["won"], reverse=True)

    if token_data.role == "analyst":
        ranking = [r for r in ranking if r["userId"] == token_data.user_id]

    return {"success": True, "data": ranking}


@router.get("/{company_id}/gerencial")
def get_gerencial(
    company_id: str,
    token_data=Depends(get_current_user_and_company),
    db: Session = Depends(get_db_session),
):
    """
    Visão gerencial agregada por filial e por vendedor.
    Admin vê tudo; analyst com scope=branch:X vê só a própria filial.
    """
    if token_data.company_id != company_id:
        raise HTTPException(status_code=403, detail="Acesso negado.")

    # Restrição territorial (unidade organizacional > scope legado), mesmo helper do /carteira
    allowed_branches = _allowed_branches(db, token_data, None)

    # Carregar oportunidades do ComputedInsights
    insights = None
    for dr in ("1m", "3m", "6m", "12m"):
        candidate = db.query(ComputedInsights).filter_by(
            company_id=company_id, date_range=dr
        ).first()
        if candidate and candidate.opportunities:
            insights = candidate
            break
    raw_opps = insights.opportunities if insights else []
    if not raw_opps:
        return {"success": True, "data": {"by_branch": [], "by_salesperson": [], "totals": {}}}

    # Batch-join: customer_hash → (branch, salesperson) via CustomerProfile
    hashes = [opp.get("customerHash", opp.get("id", "")) for opp in raw_opps]
    q = db.query(
        CustomerProfile.customer_hash,
        CustomerProfile.branch,
        CustomerProfile.salesperson,
    ).filter(
        CustomerProfile.company_id == company_id,
        CustomerProfile.customer_hash.in_(hashes),
    )
    if allowed_branches is not None:
        q = q.filter(CustomerProfile.branch.in_(allowed_branches))
    profile_map = {row[0]: {"branch": row[1], "salesperson": row[2]} for row in q.all()}

    # Carregar todas as ações da empresa para mapear status por opp_id.
    # Tiebreak ÚNICO (mais recente por updated_at) compartilhado com /metrics — garante o
    # MESMO won/conversão nas duas telas, de forma determinística.
    actions = db.query(OpportunityAction).filter_by(company_id=company_id).all()
    latest = metrics_service.latest_action_by_opportunity(actions)
    action_status: dict = {opp_id: a.status for opp_id, a in latest.items()}
    action_value: dict = {opp_id: (a.expected_value or 0.0) for opp_id, a in latest.items()}

    def _empty_bucket():
        return {"total_opportunities": 0, "total_value": 0.0,
                "to_contact": 0, "contacted": 0, "won": 0, "lost": 0, "won_value": 0.0}

    branch_agg: dict = {}
    sales_agg: dict = {}
    total = _empty_bucket()

    for opp in raw_opps:
        opp_id = opp.get("customerHash", opp.get("id", ""))
        prof = profile_map.get(opp_id)
        if allowed_branches is not None and prof is None:
            continue  # fora do escopo territorial

        branch_key = (prof.get("branch") or "Sem filial") if prof else "Sem filial"
        sales_key = (prof.get("salesperson") or "Sem vendedor") if prof else "Sem vendedor"
        status = action_status.get(opp_id, "to_contact")
        value = action_value.get(opp_id, opp.get("expectedValue", 0.0) or 0.0)
        won_v = value if status == "won" else 0.0

        for agg, key in ((branch_agg, branch_key), (sales_agg, sales_key)):
            b = agg.setdefault(key, _empty_bucket())
            b["total_opportunities"] += 1
            b["total_value"] += value
            b[status] = b.get(status, 0) + 1
            b["won_value"] += won_v

        total["total_opportunities"] += 1
        total["total_value"] += value
        total[status] = total.get(status, 0) + 1
        total["won_value"] += won_v

    def _format(agg: dict, key_name: str):
        rows = []
        for k, v in agg.items():
            conv = metrics_service.conversion_rate(v["won"], v["contacted"], v["lost"])
            rows.append({
                key_name: k,
                "totalOpportunities": v["total_opportunities"],
                "totalValue": round(v["total_value"], 2),
                "toContact": v["to_contact"],
                "contacted": v["contacted"],
                "won": v["won"],
                "lost": v["lost"],
                "wonValue": round(v["won_value"], 2),
                "conversionRate": conv if conv is not None else 0.0,
            })
        rows.sort(key=lambda x: x["totalValue"], reverse=True)
        return rows

    return {
        "success": True,
        "data": {
            "by_branch": _format(branch_agg, "branch"),
            "by_salesperson": _format(sales_agg, "salesperson"),
            "totals": {
                "totalOpportunities": total["total_opportunities"],
                "totalValue": round(total["total_value"], 2),
                "won": total["won"],
                "wonValue": round(total["won_value"], 2),
            },
        },
    }


# ─── Metas Comerciais ─────────────────────────────────────────────────────────

_VALID_KEY_TYPES = {"branch", "salesperson", "company"}
_VALID_PERIODS = {"month", "quarter", "year"}


@router.get("/{company_id}/targets")
def list_targets(
    company_id: str,
    period: Optional[str] = Query(default=None),
    token_data=Depends(get_current_user_and_company),
    db: Session = Depends(get_db_session),
):
    """Lista metas comerciais da empresa. Apenas admin."""
    if token_data.company_id != company_id:
        raise HTTPException(status_code=403, detail="Acesso negado.")
    if token_data.role != "admin":
        raise HTTPException(status_code=403, detail="Apenas administradores podem ver metas.")

    q = db.query(SalesTarget).filter_by(company_id=company_id)
    if period:
        q = q.filter(SalesTarget.period == period)
    targets = q.order_by(SalesTarget.key_type, SalesTarget.key_value).all()

    return {
        "success": True,
        "data": [
            {
                "id": t.id,
                "keyType": t.key_type,
                "keyValue": t.key_value,
                "period": t.period,
                "targetWon": t.target_won,
                "targetValue": t.target_value,
                "createdAt": t.created_at.isoformat() if t.created_at else None,
            }
            for t in targets
        ],
    }


@router.post("/{company_id}/targets")
def upsert_target(
    company_id: str,
    data: SalesTargetRequest,
    token_data=Depends(get_current_user_and_company),
    db: Session = Depends(get_db_session),
):
    """Cria ou atualiza uma meta. Chave única: (key_type, key_value, period)."""
    if token_data.company_id != company_id:
        raise HTTPException(status_code=403, detail="Acesso negado.")
    if token_data.role != "admin":
        raise HTTPException(status_code=403, detail="Apenas administradores podem definir metas.")
    if data.key_type not in _VALID_KEY_TYPES:
        raise HTTPException(status_code=400, detail=f"key_type inválido: {data.key_type}.")
    if data.period not in _VALID_PERIODS:
        raise HTTPException(status_code=400, detail=f"Período inválido: {data.period}.")

    existing = db.query(SalesTarget).filter_by(
        company_id=company_id,
        key_type=data.key_type,
        key_value=data.key_value,
        period=data.period,
    ).first()

    if existing:
        existing.target_won = data.target_won
        existing.target_value = data.target_value
    else:
        db.add(SalesTarget(
            company_id=company_id,
            key_type=data.key_type,
            key_value=data.key_value,
            period=data.period,
            target_won=data.target_won,
            target_value=data.target_value,
        ))

    db.commit()
    logger.info("carteira.target.upserted", extra={"company_id": company_id, "key_type": data.key_type})
    return {"success": True, "message": "Meta salva com sucesso."}


@router.delete("/{company_id}/targets/{target_id}")
def delete_target(
    company_id: str,
    target_id: str,
    token_data=Depends(get_current_user_and_company),
    db: Session = Depends(get_db_session),
):
    """Remove uma meta comercial."""
    if token_data.company_id != company_id:
        raise HTTPException(status_code=403, detail="Acesso negado.")
    if token_data.role != "admin":
        raise HTTPException(status_code=403, detail="Apenas administradores podem remover metas.")

    target = db.query(SalesTarget).filter_by(id=target_id, company_id=company_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Meta não encontrada.")

    db.delete(target)
    db.commit()
    return {"success": True, "message": "Meta removida."}
