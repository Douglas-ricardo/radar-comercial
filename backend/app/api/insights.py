# app/api/insights.py
import json
import logging
from datetime import datetime

from fastapi import APIRouter, Depends, Query, HTTPException
from fastapi.responses import Response
from redis.exceptions import RedisError
from sqlalchemy.orm import Session

from app.infrastructure.database import get_db_session
from app.infrastructure.redis_client import redis_client
from app.core.auth import get_current_user_and_company
from app.domain.models import ComputedInsights, Company, CustomerProfile
from app.services.pdf_report import build_insights_pdf

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


_RISK_ORDER = {"high": 3, "medium": 2, "low": 1, "none": 0}


@router.get("/{company_id}/churn-risk")
def get_churn_risk(
    company_id: str,
    token_data=Depends(get_current_user_and_company),
    db: Session = Depends(get_db_session),
):
    """Clientes prestes a sumir (churn preditivo): ainda ativos, mas atrasados
    em relação à própria cadência de compra. Janela de ação proativa."""
    if str(token_data.company_id) != company_id:
        raise HTTPException(status_code=403, detail="Acesso negado.")

    rows = (
        db.query(CustomerProfile)
        .filter(
            CustomerProfile.company_id == company_id,
            CustomerProfile.churn_risk.in_(["low", "medium", "high"]),
        )
        .all()
    )
    rows.sort(key=lambda p: (_RISK_ORDER.get(p.churn_risk, 0), p.total_revenue or 0.0), reverse=True)

    data = [
        {
            "customerHash": p.customer_hash,
            "customerName": p.customer_name,
            "risk": p.churn_risk,
            "score": p.churn_score,
            "recencyDays": p.recency_days,
            "avgIntervalDays": p.avg_interval_days,
            "totalRevenue": p.total_revenue,
            "expectedValue": round((p.total_revenue or 0.0) / max(p.rfv.get("frequency", 1) if p.rfv else 1, 1), 2),
            "phone": p.phone,
            "email": p.email,
        }
        for p in rows
    ]
    counts = {"high": 0, "medium": 0, "low": 0}
    for p in rows:
        counts[p.churn_risk] = counts.get(p.churn_risk, 0) + 1

    return {"success": True, "data": {"customers": data, "counts": counts, "total": len(data)}}


@router.get("/{company_id}/report")
def export_insights_pdf(
    company_id: str,
    date_range: str = Query("6m", alias="date_range"),
    token_data=Depends(get_current_user_and_company),
    db: Session = Depends(get_db_session),
):
    """Gera o relatório de insights em PDF a partir do ComputedInsights."""
    if str(token_data.company_id) != company_id:
        raise HTTPException(status_code=403, detail="Acesso negado.")

    if date_range not in VALID_DATE_RANGES:
        raise HTTPException(status_code=400, detail=f"Período inválido: '{date_range}'.")

    row = (
        db.query(ComputedInsights)
        .filter_by(company_id=company_id, date_range=date_range)
        .first()
    )
    if not row:
        raise HTTPException(
            status_code=404,
            detail="Nenhum dado encontrado para o período. Faça upload de uma planilha primeiro.",
        )

    company = db.query(Company).filter_by(id=company_id).first()
    company_name = company.name if company else "Empresa"

    pdf_bytes = build_insights_pdf(
        company_name=company_name,
        date_range=date_range,
        summary=row.summary or {},
        opportunities=row.opportunities or [],
        charts=row.charts or {},
    )

    safe = "".join(c if c.isalnum() else "-" for c in (company_name or "empresa").lower()).strip("-") or "empresa"
    stamp = datetime.now().strftime("%Y-%m-%d")
    filename = f"relatorio-radar-{safe}-{stamp}.pdf"

    logger.info("insights.report.generated", extra={"company_id": company_id, "date_range": date_range})
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{company_id}/forecast")
def get_forecast(
    company_id: str,
    date_range: str = Query("6m"),
    token_data=Depends(get_current_user_and_company),
    db: Session = Depends(get_db_session),
):
    """Previsão de receita para os próximos 3 meses com base na série histórica."""
    if str(token_data.company_id) != company_id:
        raise HTTPException(status_code=403, detail="Acesso negado.")

    if date_range not in VALID_DATE_RANGES:
        raise HTTPException(status_code=400, detail=f"Período inválido: '{date_range}'.")

    row = db.query(ComputedInsights).filter_by(company_id=company_id, date_range=date_range).first()
    if not row or not row.charts:
        raise HTTPException(status_code=404, detail="Nenhum dado encontrado. Faça upload de uma planilha primeiro.")

    series = (row.charts.get("timeSeries") or [])
    revenues = [float(p.get("receita", 0) or 0) for p in series if p.get("receita") is not None]

    if len(revenues) < 2:
        raise HTTPException(status_code=422, detail="Dados insuficientes para previsão (mínimo 2 meses).")

    # Média de variação dos últimos N meses (usa todos disponíveis, máx 6)
    window = revenues[-6:] if len(revenues) > 6 else revenues
    deltas = [window[i] - window[i - 1] for i in range(1, len(window))]
    avg_delta = sum(deltas) / len(deltas) if deltas else 0.0
    last_value = revenues[-1]

    # Último mês do histórico para nomear os próximos
    import calendar
    last_month_str = (series[-1].get("month") or "") if series else ""
    try:
        last_dt = datetime.strptime(last_month_str, "%Y-%m")
    except ValueError:
        try:
            last_dt = datetime.strptime(last_month_str, "%b %Y")
        except ValueError:
            last_dt = datetime.utcnow().replace(day=1)

    forecast_months = []
    std_dev = (sum((d - avg_delta) ** 2 for d in deltas) / len(deltas)) ** 0.5 if len(deltas) > 1 else abs(avg_delta) * 0.2
    current = last_value
    for i in range(1, 4):
        month_num = (last_dt.month + i - 1) % 12 + 1
        year = last_dt.year + (last_dt.month + i - 1) // 12
        label = f"{calendar.month_abbr[month_num]} {year}"
        projected = max(0.0, current + avg_delta)
        forecast_months.append({
            "month": label,
            "projectedRevenue": round(projected, 2),
            "confidenceLow": round(max(0.0, projected - std_dev * 1.5), 2),
            "confidenceHigh": round(projected + std_dev * 1.5, 2),
        })
        current = projected

    trend = "up" if avg_delta > 0 else ("down" if avg_delta < 0 else "flat")
    return {
        "success": True,
        "data": {
            "months": forecast_months,
            "trend": trend,
            "avgMonthlyGrowth": round(avg_delta, 2),
        },
    }
