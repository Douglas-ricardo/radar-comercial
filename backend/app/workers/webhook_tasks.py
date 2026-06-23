# app/workers/webhook_tasks.py
"""Celery task para entrega assíncrona de webhooks de saída com retry exponencial."""
from __future__ import annotations

import hashlib
import hmac
import json
import logging
import uuid
from datetime import datetime

import httpx

from app.core.celery_app import celery_app
from app.core.clock import utcnow
from app.infrastructure.database import SessionLocal

logger = logging.getLogger(__name__)

_TIMEOUT = 10  # segundos por tentativa


@celery_app.task(bind=True, max_retries=3, ignore_result=True)
def deliver_webhook_task(self, config_id: str, company_id: str, event: str, payload: dict):
    """
    POST o payload para a URL configurada com assinatura HMAC-SHA256.
    Retry exponencial: 30s → 5min → 30min.
    Grava WebhookDelivery com resultado de cada tentativa.
    """
    from app.domain.models import WebhookConfig, WebhookDelivery

    db = SessionLocal()
    delivery_id = str(uuid.uuid4())
    try:
        cfg = db.query(WebhookConfig).filter_by(id=config_id).first()
        if not cfg or not cfg.enabled:
            return

        body = json.dumps({"event": event, "data": payload}, ensure_ascii=False).encode()
        sig = "sha256=" + hmac.new(cfg.secret.encode(), body, hashlib.sha256).hexdigest()

        response_code = None
        status = "failed"
        try:
            resp = httpx.post(
                cfg.target_url,
                content=body,
                headers={
                    "Content-Type": "application/json",
                    "X-Radar-Signature": sig,
                    "X-Radar-Event": event,
                },
                timeout=_TIMEOUT,
            )
            response_code = resp.status_code
            status = "delivered" if resp.status_code < 400 else "failed"
        except httpx.RequestError as exc:
            logger.warning("webhook.deliver.request_error", extra={"config_id": config_id, "error": str(exc)})

        db.add(WebhookDelivery(
            id=delivery_id,
            config_id=config_id,
            company_id=company_id,
            event=event,
            payload=payload,
            status=status,
            response_code=response_code,
            attempts=(self.request.retries or 0) + 1,
            created_at=utcnow(),
        ))
        db.commit()

        if status == "failed":
            countdowns = [30, 300, 1800]
            retry_in = countdowns[self.request.retries] if self.request.retries < len(countdowns) else 1800
            raise self.retry(countdown=retry_in)

    except self.MaxRetriesExceededError:
        pass
    except Exception as exc:
        logger.error("webhook.deliver.error", extra={"config_id": config_id, "error": str(exc)}, exc_info=True)
        db.rollback()
        raise self.retry(exc=exc, countdown=60)
    finally:
        db.close()
