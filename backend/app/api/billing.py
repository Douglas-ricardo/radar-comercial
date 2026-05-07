# app/api/billing.py
import logging
import os
from datetime import datetime
from typing import Literal, Optional

import stripe
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.auth import get_current_user_and_company
from app.domain.models import Company
from app.infrastructure.database import get_db_session
from app.infrastructure.redis_client import redis_client
from app.services.plan_service import PlanService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/billing", tags=["Billing"])

stripe.api_key = os.getenv("STRIPE_SECRET_KEY")


class CheckoutPlanRequest(BaseModel):
    plan: Literal["pro", "enterprise"]


def _stripe_price_id_for_plan(plan: str) -> str:
    price_id = os.getenv("STRIPE_PRICE_PRO") if plan == "pro" else os.getenv("STRIPE_PRICE_ENTERPRISE")
    if not price_id:
        raise HTTPException(
            status_code=503,
            detail="Preço Stripe não configurado (STRIPE_PRICE_PRO / STRIPE_PRICE_ENTERPRISE).",
        )
    return price_id


def _resolve_plan_from_session(session: dict) -> Optional[str]:
    """
    Tenta determinar o plano a partir da sessão Stripe.
    Estratégia 1: metadata.plan (preferencial — definido na criação da sessão).
    Estratégia 2: price_id das line_items (fallback).
    """
    meta = session.get("metadata") or {}
    plan = meta.get("plan")
    if plan in ("pro", "enterprise"):
        return plan

    price_pro = os.getenv("STRIPE_PRICE_PRO")
    price_ent = os.getenv("STRIPE_PRICE_ENTERPRISE")
    line_items = session.get("line_items")
    if isinstance(line_items, dict) and line_items.get("data"):
        for item in line_items["data"]:
            price = (item or {}).get("price") or {}
            pid = price.get("id") if isinstance(price, dict) else None
            if pid and price_ent and pid == price_ent:
                return "enterprise"
            if pid and price_pro and pid == price_pro:
                return "pro"
    return None


def _invalidate_insights_cache(company_id: str) -> None:
    """Limpa o cache de insights após mudança de plano para evitar dados desatualizados."""
    try:
        for period in ("1m", "3m", "6m", "12m"):
            redis_client.delete(f"insights:{company_id}:{period}")
    except Exception as exc:
        # Falha de cache não deve bloquear o upgrade
        logger.warning("billing.cache.invalidate_error", extra={"company_id": company_id, "error": str(exc)})


@router.post("/create-checkout-session")
def create_checkout_session(
    data: CheckoutPlanRequest,
    token_data=Depends(get_current_user_and_company),
    db: Session = Depends(get_db_session),
):
    if not stripe.api_key:
        raise HTTPException(status_code=503, detail="Stripe não configurado (STRIPE_SECRET_KEY).")

    if token_data.role != "admin":
        raise HTTPException(status_code=403, detail="Apenas administradores podem gerir a subscrição.")

    company_id = str(token_data.company_id)
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Empresa não encontrada.")

    price_id = _stripe_price_id_for_plan(data.plan)
    frontend = os.getenv("FRONTEND_URL", "http://localhost:3000").rstrip("/")

    session = stripe.checkout.Session.create(
        line_items=[{"price": price_id, "quantity": 1}],
        mode="subscription",
        client_reference_id=company_id,
        metadata={"plan": data.plan, "company_id": company_id},
        success_url=f"{frontend}/dashboard/billing?upgraded=1",
        cancel_url=f"{frontend}/dashboard/billing?cancelled=1",
    )

    logger.info("billing.checkout.created", extra={"company_id": company_id, "plan": data.plan})

    return {"success": True, "data": {"url": session.url}}


@router.post("/webhook")
async def stripe_webhook(request: Request, db: Session = Depends(get_db_session)):
    webhook_secret = os.getenv("STRIPE_WEBHOOK_SECRET")
    if not webhook_secret:
        raise HTTPException(status_code=503, detail="Webhook Stripe não configurado (STRIPE_WEBHOOK_SECRET).")

    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")
    if not sig_header:
        raise HTTPException(status_code=400, detail="Cabeçalho Stripe-Signature em falta.")

    try:
        event = stripe.Webhook.construct_event(payload, sig_header, webhook_secret)
    except ValueError:
        raise HTTPException(status_code=400, detail="Payload inválido.")
    except stripe.error.SignatureVerificationError:
        raise HTTPException(status_code=400, detail="Assinatura inválida.")

    # Ignora eventos que não são de interesse
    if event["type"] != "checkout.session.completed":
        return {"status": "ignored", "reason": "event_type_not_handled"}

    # ----------------------------------------------------------------
    # IDEMPOTÊNCIA — o Stripe pode reenviar o mesmo evento várias vezes.
    # Verificamos se já processamos este event_id antes de agir.
    # ----------------------------------------------------------------
    event_id = event.get("id", "")
    idempotency_key = f"stripe_event:{event_id}"

    try:
        already_processed = redis_client.get(idempotency_key)
    except Exception as exc:
        # Redis indisponível não deve bloquear o processamento
        logger.warning("billing.webhook.redis_unavailable", extra={"error": str(exc)})
        already_processed = None

    if already_processed:
        logger.info("billing.webhook.duplicate", extra={"event_id": event_id})
        return {"status": "already_processed"}

    session = event["data"]["object"]

    # ----------------------------------------------------------------
    # DADOS DO STRIPE — problemas aqui não devem gerar retries infinitos.
    # Retornamos 200 com status "ignored" em vez de 4xx.
    # O Stripe interpreta qualquer não-2xx como falha e reenvia por 3 dias.
    # ----------------------------------------------------------------
    company_id = session.get("client_reference_id")
    if not company_id:
        logger.error("billing.webhook.missing_company_id", extra={"session_id": session.get("id")})
        return {"status": "ignored", "reason": "missing_client_reference_id"}

    novo_plano = _resolve_plan_from_session(session)
    if not novo_plano:
        logger.error("billing.webhook.unknown_plan", extra={"session_id": session.get("id"), "company_id": company_id})
        return {"status": "ignored", "reason": "could_not_resolve_plan"}

    # ----------------------------------------------------------------
    # ATUALIZA A EMPRESA — erro de banco SIM deve retornar 500
    # para o Stripe retentar (problema transiente, não de dados).
    # ----------------------------------------------------------------
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        logger.error("billing.webhook.company_not_found", extra={"company_id": company_id})
        # Empresa não existe — não vai aparecer num retry, retorna 200
        return {"status": "ignored", "reason": "company_not_found"}

    customer = session.get("customer")
    if isinstance(customer, dict):
        customer = customer.get("id")
    subscription = session.get("subscription")
    if isinstance(subscription, dict):
        subscription = subscription.get("id")

    company.stripe_customer_id = customer if isinstance(customer, str) else None
    company.stripe_subscription_id = subscription if isinstance(subscription, str) else None
    company.plan = novo_plano
    company.uploads_limit = PlanService.get_upload_limit_for_plan(novo_plano)
    company.plan_updated_at = datetime.utcnow()

    db.commit()

    logger.info(
        "billing.webhook.upgrade_applied",
        extra={"company_id": company_id, "plan": novo_plano},
    )

    # Invalida cache de insights para o usuário ver dados do novo plano imediatamente
    _invalidate_insights_cache(company_id)

    # Marca evento como processado no Redis (TTL de 24 h)
    try:
        redis_client.setex(idempotency_key, 86400, "1")
    except Exception as exc:
        logger.warning("billing.webhook.redis_set_error", extra={"error": str(exc)})

    return {"status": "success"}


@router.post("/debug-sync-plan")
def debug_sync_plan(
    token_data=Depends(get_current_user_and_company),
    db: Session = Depends(get_db_session),
):
    """
    Endpoint de desenvolvimento: sincroniza o plano da empresa com o Stripe
    buscando a assinatura ativa pelo stripe_customer_id.
    Só funciona quando DEBUG_WEBHOOK=true no .env.
    """
    if os.getenv("DEBUG_WEBHOOK", "false").lower() != "true":
        raise HTTPException(status_code=404, detail="Not found.")

    if not stripe.api_key:
        raise HTTPException(status_code=503, detail="Stripe não configurado.")

    company_id = str(token_data.company_id)
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Empresa não encontrada.")

    if not company.stripe_customer_id:
        raise HTTPException(
            status_code=400,
            detail="Empresa não tem stripe_customer_id. Faça o checkout primeiro.",
        )

    # Busca assinaturas ativas no Stripe para este customer
    subscriptions = stripe.Subscription.list(
        customer=company.stripe_customer_id, status="active", limit=1
    )

    if not subscriptions.data:
        raise HTTPException(status_code=400, detail="Nenhuma assinatura ativa encontrada no Stripe.")

    sub = subscriptions.data[0]
    price_id = sub["items"]["data"][0]["price"]["id"]

    price_pro = os.getenv("STRIPE_PRICE_PRO")
    price_ent = os.getenv("STRIPE_PRICE_ENTERPRISE")

    if price_id == price_ent:
        novo_plano = "enterprise"
    elif price_id == price_pro:
        novo_plano = "pro"
    else:
        raise HTTPException(status_code=400, detail=f"Price ID desconhecido: {price_id}")

    company.plan = novo_plano
    company.uploads_limit = PlanService.get_upload_limit_for_plan(novo_plano)
    company.stripe_subscription_id = sub["id"]
    company.plan_updated_at = datetime.utcnow()
    db.commit()

    _invalidate_insights_cache(company_id)

    logger.info("billing.debug_sync.applied", extra={"company_id": company_id, "plan": novo_plano})

    return {
        "success": True,
        "data": {"plan": novo_plano, "uploadsLimit": company.uploads_limit},
        "message": f"Plano sincronizado para {novo_plano}.",
    }