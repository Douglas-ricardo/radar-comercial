"""Metering de uso por tenant + quotas por plano.

record_usage incrementa um contador diário (best-effort, nunca bloqueia a operação).
Quotas são limites diários por plano; check_quota retorna se ainda há saldo.
"""
import logging
from datetime import timedelta

from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app.core.clock import utcnow
from app.domain.models import UsageEvent

logger = logging.getLogger(__name__)

KINDS = ("api_call", "upload", "ai_generation", "outreach")

# Quotas diárias por plano (0/ausente = ilimitado). Uploads continuam no PlanService.
DAILY_QUOTAS: dict[str, dict[str, int]] = {
    "free":       {"api_call": 500,   "ai_generation": 20,   "outreach": 20},
    "pro":        {"api_call": 20000, "ai_generation": 200,  "outreach": 500},
    "enterprise": {},  # ilimitado
}


def _today() -> str:
    # Dia em BRT (UTC-3) para alinhar com o resto do produto.
    return (utcnow() - timedelta(hours=3)).strftime("%Y-%m-%d")


def record_usage(db: Session, company_id: str, kind: str, n: int = 1) -> None:
    """Incrementa o contador diário do tipo. Best-effort (não levanta)."""
    if kind not in KINDS:
        return
    day = _today()
    try:
        row = db.query(UsageEvent).filter_by(company_id=company_id, kind=kind, day=day).first()
        if row:
            row.count = (row.count or 0) + n
        else:
            db.add(UsageEvent(company_id=company_id, kind=kind, day=day, count=n))
        db.commit()
    except IntegrityError:
        # Corrida no upsert: outra request criou a linha — soma e segue.
        db.rollback()
        try:
            row = db.query(UsageEvent).filter_by(company_id=company_id, kind=kind, day=day).first()
            if row:
                row.count = (row.count or 0) + n
                db.commit()
        except Exception:
            db.rollback()
    except Exception as exc:
        db.rollback()
        logger.warning("usage.record.error", extra={"kind": kind, "error": str(exc)})


def quota_for(plan: str, kind: str) -> int | None:
    """Limite diário do tipo para o plano; None = ilimitado."""
    return DAILY_QUOTAS.get(plan, {}).get(kind)


def usage_today(db: Session, company_id: str, kind: str) -> int:
    row = db.query(UsageEvent).filter_by(company_id=company_id, kind=kind, day=_today()).first()
    return row.count if row else 0


def check_quota(db: Session, company, kind: str) -> bool:
    """True se ainda há saldo hoje (ou se ilimitado)."""
    limit = quota_for(getattr(company, "plan", "free"), kind)
    if not limit:
        return True
    return usage_today(db, company.id, kind) < limit
