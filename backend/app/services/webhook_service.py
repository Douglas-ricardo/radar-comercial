# app/services/webhook_service.py
"""Despacha eventos de oportunidade para webhooks externos (CRM push).

Fluxo: upsert_action → dispatch_webhook → enfileira deliver_webhook_task (Celery)
→ POST com HMAC-SHA256 no header X-Radar-Signature → grava WebhookDelivery.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import logging
import uuid
from datetime import datetime

logger = logging.getLogger(__name__)


def dispatch_webhook(db, company_id: str, event: str, payload: dict) -> None:
    """Enfileira entrega assíncrona para cada webhook habilitado que escuta o evento."""
    from app.domain.models import WebhookConfig
    from app.workers.webhook_tasks import deliver_webhook_task

    configs = (
        db.query(WebhookConfig)
        .filter_by(company_id=company_id, enabled=True)
        .all()
    )
    for cfg in configs:
        subscribed = cfg.events or []
        if event in subscribed or "*" in subscribed:
            try:
                deliver_webhook_task.delay(cfg.id, company_id, event, payload)
            except Exception as exc:
                logger.warning(
                    "webhook.dispatch.enqueue_error",
                    extra={"config_id": cfg.id, "event": event, "error": str(exc)},
                )


def sign_payload(secret: str, body: bytes) -> str:
    return "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
