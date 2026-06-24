# app/api/status.py
"""Página de status público — health dos serviços (API, DB, Redis, worker)."""
import logging
import time

from fastapi import APIRouter
from sqlalchemy import text

from app.infrastructure.database import SessionLocal
from app.infrastructure.redis_client import redis_client

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/status", tags=["Status"])


def _check_db() -> dict:
    t0 = time.time()
    try:
        db = SessionLocal()
        db.execute(text("SELECT 1"))
        db.close()
        return {"status": "operational", "latencyMs": round((time.time() - t0) * 1000, 1)}
    except Exception as exc:
        return {"status": "down", "error": str(exc)[:120]}


def _check_redis() -> dict:
    t0 = time.time()
    try:
        redis_client.ping()
        return {"status": "operational", "latencyMs": round((time.time() - t0) * 1000, 1)}
    except Exception as exc:
        return {"status": "down", "error": str(exc)[:120]}


def _check_worker() -> dict:
    """Pinga os workers Celery (broker + consumidores ativos)."""
    try:
        from app.core.celery_app import celery_app
        replies = celery_app.control.ping(timeout=1.0)
        if replies:
            return {"status": "operational", "workers": len(replies)}
        return {"status": "degraded", "workers": 0, "note": "broker ok, nenhum worker respondeu"}
    except Exception as exc:
        return {"status": "down", "error": str(exc)[:120]}


@router.get("")
def get_status():
    services = {
        "api": {"status": "operational"},
        "database": _check_db(),
        "redis": _check_redis(),
        "worker": _check_worker(),
    }
    statuses = [s["status"] for s in services.values()]
    overall = "operational"
    if "down" in statuses:
        overall = "outage"
    elif "degraded" in statuses:
        overall = "degraded"
    return {"success": True, "data": {"overall": overall, "services": services}}
