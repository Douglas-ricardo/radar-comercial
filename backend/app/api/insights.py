# app/api/insights.py
import json
import logging

from fastapi import APIRouter, Depends, Query, HTTPException
from redis.exceptions import RedisError
from sqlalchemy.orm import Session

from app.infrastructure.database import get_db_session
from app.infrastructure.redis_client import redis_client
from app.core.auth import get_current_user_and_company
from app.domain.models import ComputedInsights

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/insights", tags=["Insights"])

VALID_DATE_RANGES = {"1m", "3m", "6m", "12m"}


@router.get("/{company_id}")
def get_insights(
    company_id: str,
    date_range: str = Query("6m", alias="date_range", description="Período de análise (1m, 3m, 6m, 12m)"),
    token_data=Depends(get_current_user_and_company),
    db: Session = Depends(get_db_session),
):
    if str(token_data.company_id) != company_id:
        raise HTTPException(status_code=403, detail="Acesso negado.")

    if date_range not in VALID_DATE_RANGES:
        raise HTTPException(
            status_code=400,
            detail=f"Período inválido: '{date_range}'. Use: 1m, 3m, 6m ou 12m.",
        )

    cache_key = f"insights:{company_id}:{date_range}"

    try:
        cached = redis_client.get(cache_key)
        if cached:
            logger.info("insights.cache.hit", extra={"company_id": company_id, "date_range": date_range})
            return {"success": True, "data": json.loads(cached)}
    except RedisError as exc:
        logger.warning("insights.redis.get_error", extra={"error": str(exc)})

    row = (
        db.query(ComputedInsights)
        .filter_by(company_id=company_id, date_range=date_range)
        .first()
    )

    if not row:
        return {
            "success": False,
            "error": "Nenhum dado encontrado para o período selecionado. Faça upload de uma planilha de vendas primeiro.",
        }

    insights_data = {
        "summary": row.summary,
        "opportunities": row.opportunities,
        "charts": row.charts,
    }

    try:
        redis_client.setex(cache_key, 900, json.dumps(insights_data, default=str))
    except RedisError as exc:
        logger.warning("insights.redis.set_error", extra={"error": str(exc)})

    return {"success": True, "data": insights_data}
