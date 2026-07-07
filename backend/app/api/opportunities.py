# app/api/opportunities.py
import json
import logging
import os
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.auth import require_analyst_or_above
from app.core.rate_limit import limiter
from app.domain.models import ComputedInsights, CustomerProfile
from app.services.live_recency import refresh_days_inactive, company_dataset_max
from app.infrastructure.database import get_db_session
from app.infrastructure.redis_client import redis_client

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/opportunities", tags=["Opportunities"])

_CACHE_TTL = 60 * 60 * 72  # 72h — invalida quando CustomerProfile mudar
_HAIKU_MODEL = "claude-haiku-4-5-20251001"
# Teto diário de gerações de IA por empresa (governança de custo Anthropic).
# Cache hits NÃO contam. 0 ou negativo desabilita o teto. Configurável via env.
_DAILY_LIMIT = int(os.getenv("AI_MESSAGE_DAILY_LIMIT", "100"))


class GenerateMessageRequest(BaseModel):
    customer_hash: str
    date_range: str = "1m"


def _within_daily_quota(company_id: str) -> bool:
    """Incrementa e checa a cota diária de geração por IA da empresa.

    Retorna True se ainda dentro do teto, False se excedeu. Degrada para True
    (não bloqueia) se o Redis estiver indisponível — disponibilidade da feature
    paga vale mais que o teto, e a falha fica logada.
    """
    if _DAILY_LIMIT <= 0:
        return True
    from app.core.clock import utcnow
    day = utcnow().strftime("%Y-%m-%d")
    key = f"ai_msg_quota:{company_id}:{day}"
    try:
        count = redis_client.incr(key)
        if count == 1:
            redis_client.expire(key, 60 * 60 * 26)  # ~1 dia + folga de fuso
        return count <= _DAILY_LIMIT
    except Exception as exc:
        logger.warning("opportunities.generate_message.quota_unavailable", extra={"error": str(exc)})
        return True


def _build_prompt(profile: CustomerProfile, opp: dict) -> str:
    segment_labels = {
        "champion": "cliente campeão (compra muito e com frequência)",
        "loyal": "cliente fiel (compra regularmente)",
        "at_risk": "cliente em risco (comprou bem antes, sumiu)",
        "lost": "cliente perdido (sem compras há muito tempo)",
        "new": "cliente novo (poucas compras)",
    }
    rfv = profile.rfv or {}
    segment = rfv.get("segment", "lost")
    segment_desc = segment_labels.get(segment, segment)
    top_products = profile.top_products or []
    top_product_names = ", ".join(p.get("product", "") for p in top_products[:3] if p.get("product"))
    days = opp.get("daysInactive", 0)
    value = opp.get("expectedValue", 0)
    last_product = opp.get("product", "")
    trend = profile.trend or "stable"
    trend_desc = {"up": "crescente", "down": "em queda", "stable": "estável"}.get(trend, "estável")

    return f"""Você é um assistente comercial de uma empresa brasileira.
Gere UMA mensagem curta e direta para o WhatsApp para reativar este cliente. A mensagem deve:
- Ser em português brasileiro, tom pessoal e consultivo (não robótico)
- Mencionar o tempo sem comprar e o produto de interesse
- Ter no máximo 3 parágrafos curtos
- Não usar emojis em excesso (máximo 2)
- Terminar com uma pergunta ou chamada para ação clara
- Ser realista para uma PME — sem linguagem corporativa

DADOS DO CLIENTE:
- Nome: {profile.customer_name}
- Perfil: {segment_desc}
- Dias sem comprar: {days}
- Último produto comprado: {last_product or 'não identificado'}
- Principais produtos históricos: {top_product_names or 'variados'}
- Valor esperado de recuperação: R$ {value:,.2f}
- Tendência de receita: {trend_desc}

Gere apenas o texto da mensagem, sem títulos ou explicações."""


@router.post("/{opportunity_id}/generate-message")
@limiter.limit("20/minute")
def generate_message(
    request: Request,
    response: Response,
    opportunity_id: str,
    data: GenerateMessageRequest,
    token_data=Depends(require_analyst_or_above),
    db: Session = Depends(get_db_session),
):
    """
    Gera mensagem de WhatsApp personalizada para uma oportunidade via Claude Haiku.
    Restrito a admin/analyst (vendedores) — viewer não dispara custo de IA.
    Cache Redis 72h por (company_id, customer_hash, computed_at date).
    """
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="Geração de mensagem por IA não configurada. Adicione ANTHROPIC_API_KEY."
        )

    company_id = token_data.company_id

    profile = db.query(CustomerProfile).filter_by(
        company_id=company_id,
        customer_hash=data.customer_hash,
    ).first()

    if not profile:
        raise HTTPException(status_code=404, detail="Perfil do cliente não encontrado.")

    # Cache keyed por company + customer + data de computação do perfil
    computed_date = profile.computed_at.date().isoformat() if profile.computed_at else "unknown"
    cache_key = f"gen_msg:{company_id}:{data.customer_hash}:{computed_date}"

    try:
        cached = redis_client.get(cache_key)
    except Exception as exc:
        # Redis indisponível não deve impedir a geração — apenas pula o cache.
        logger.warning("opportunities.generate_message.cache_unavailable", extra={"error": str(exc)})
        cached = None
    if cached:
        logger.info("opportunities.generate_message.cache_hit", extra={"customer_hash": data.customer_hash})
        return {"success": True, "data": {"message": cached, "cached": True}}

    # Cache miss → vamos chamar a IA: aplica teto diário por empresa (custo).
    if not _within_daily_quota(company_id):
        logger.warning("opportunities.generate_message.quota_exceeded", extra={"company_id": company_id})
        raise HTTPException(
            status_code=429,
            detail=f"Limite diário de geração por IA atingido ({_DAILY_LIMIT}/dia). Tente novamente amanhã.",
        )

    # Busca a oportunidade nos ComputedInsights para pegar o dict com daysInactive/expectedValue
    insights = db.query(ComputedInsights).filter_by(
        company_id=company_id,
        date_range=data.date_range,
    ).first()

    opp: dict = {}
    if insights and insights.opportunities:
        # Recência viva: o prompt da IA menciona "dias sem comprar" — refresca contra
        # hoje (gated por frescor) antes de escolher a opp, igual ao dashboard.
        dataset_max = company_dataset_max(db, company_id)
        for o in refresh_days_inactive(insights.opportunities, dataset_max):
            if o.get("customerHash") == data.customer_hash:
                opp = o
                break

    prompt = _build_prompt(profile, opp)

    try:
        import anthropic
        client = anthropic.Anthropic(api_key=api_key)
        response = client.messages.create(
            model=_HAIKU_MODEL,
            max_tokens=400,
            messages=[{"role": "user", "content": prompt}],
        )
        message = response.content[0].text.strip()
    except Exception as exc:
        logger.error("opportunities.generate_message.error", extra={"error": str(exc)})
        raise HTTPException(status_code=502, detail="Erro ao gerar mensagem. Tente novamente.")

    try:
        redis_client.setex(cache_key, _CACHE_TTL, message)
    except Exception as exc:
        logger.warning("opportunities.generate_message.cache_set_error", extra={"error": str(exc)})

    logger.info("opportunities.generate_message.generated", extra={
        "customer_hash": data.customer_hash,
        "company_id": company_id,
    })
    from app.services import usage_service
    usage_service.record_usage(db, company_id, "ai_generation")
    return {"success": True, "data": {"message": message, "cached": False}}
