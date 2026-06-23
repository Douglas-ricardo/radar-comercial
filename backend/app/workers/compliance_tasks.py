# app/workers/compliance_tasks.py
"""Tarefas de governança/compliance: purga de auditoria por retenção e export LGPD."""
import json
import logging
import os
import secrets
import uuid
import zipfile
from datetime import timedelta
from pathlib import Path

from app.core.celery_app import celery_app
from app.core.clock import utcnow
from app.infrastructure import storage
from app.infrastructure.database import SessionLocal
from app.infrastructure.redis_client import redis_client
from app.domain.models import (
    Company, User, ComputedInsights, CustomerProfile, OpportunityAction,
    AuditLog, OutreachConfig, NotificationPreference, IntegrationConfig,
)
from app.services.notification_service import NotificationService

logger = logging.getLogger(__name__)

_EXPORT_TOKEN_PREFIX = "data_export:"
_EXPORT_TTL = 60 * 60 * 24  # 24h


@celery_app.task(name="purge_old_audit_logs", bind=True, ignore_result=True)
def purge_old_audit_logs(self):
    """Remove logs de auditoria além da janela de retenção de cada empresa."""
    db = SessionLocal()
    purged = 0
    try:
        for company in db.query(Company).all():
            days = company.audit_retention_days or 365
            cutoff = utcnow() - timedelta(days=days)
            n = db.query(AuditLog).filter(
                AuditLog.company_id == company.id,
                AuditLog.created_at < cutoff,
            ).delete(synchronize_session=False)
            purged += n
        db.commit()
        logger.info("audit.purge.done", extra={"purged": purged})
    except Exception as exc:
        logger.error("audit.purge.error", extra={"error": str(exc)}, exc_info=True)
        db.rollback()
    finally:
        db.close()


def _rows(query, fields) -> list[dict]:
    out = []
    for r in query:
        d = {}
        for f in fields:
            v = getattr(r, f, None)
            d[f] = v.isoformat() if hasattr(v, "isoformat") else v
        out.append(d)
    return out


@celery_app.task(name="build_company_export", bind=True, max_retries=1, ignore_result=True)
def build_company_export(self, company_id: str, user_id: str):
    """Gera um ZIP com todos os dados da empresa, armazena e envia o link por e-mail."""
    db = SessionLocal()
    try:
        company = db.query(Company).filter_by(id=company_id).first()
        if not company:
            return
        requester = db.query(User).filter_by(id=user_id).first()

        bundle = {
            "company": {
                "id": company.id, "name": company.name, "cnpj": company.cnpj,
                "plan": company.plan, "created_at": company.created_at.isoformat() if company.created_at else None,
            },
            "users": _rows(
                db.query(User).filter_by(company_id=company_id),
                ["id", "email", "name", "role", "status", "scope", "created_at"],
            ),
            "computed_insights": [
                {"date_range": ci.date_range, "summary": ci.summary, "opportunities": ci.opportunities, "charts": ci.charts}
                for ci in db.query(ComputedInsights).filter_by(company_id=company_id)
            ],
            "customer_profiles": _rows(
                db.query(CustomerProfile).filter_by(company_id=company_id),
                ["customer_hash", "customer_name", "document_id", "branch", "salesperson",
                 "phone", "email", "segment", "churn_risk", "recency_days", "total_revenue", "contact_opt_out"],
            ),
            "opportunity_actions": _rows(
                db.query(OpportunityAction).filter_by(company_id=company_id),
                ["opportunity_id", "customer_name", "status", "channel", "expected_value", "updated_at"],
            ),
            "audit_logs": _rows(
                db.query(AuditLog).filter_by(company_id=company_id).order_by(AuditLog.created_at.desc()).limit(20000),
                ["action", "user_id", "user_name", "resource_type", "resource_id", "ip", "created_at"],
            ),
            "outreach_config": _rows(
                db.query(OutreachConfig).filter_by(company_id=company_id),
                ["auto_send_enabled", "whatsapp_enabled", "email_enabled", "sender_name", "send_hour", "daily_limit"],
            ),
            "notification_preferences": _rows(
                db.query(NotificationPreference).filter_by(company_id=company_id),
                ["user_id", "enabled", "email_enabled", "whatsapp_enabled", "send_hour"],
            ),
            "integrations": _rows(
                db.query(IntegrationConfig).filter_by(company_id=company_id),
                ["type", "enabled", "last_sync_at", "last_sync_status"],
            ),
            "exported_at": utcnow().isoformat(),
        }

        # Monta o ZIP em arquivo temporário local.
        tmp_dir = Path(os.getenv("TEMP_DIR", str(Path(__file__).resolve().parent.parent.parent / "temp")))
        tmp_dir.mkdir(parents=True, exist_ok=True)
        local_zip = str(tmp_dir / f"export_{uuid.uuid4().hex}.zip")
        with zipfile.ZipFile(local_zip, "w", zipfile.ZIP_DEFLATED) as zf:
            for name, content in bundle.items():
                zf.writestr(f"{name}.json", json.dumps(content, ensure_ascii=False, indent=2, default=str))

        # Armazena (R2 ou disco) e gera token de download (24h).
        key = f"exports/{company_id}/{uuid.uuid4().hex}.zip"
        ref = storage.store_from_local(local_zip, key)
        token = secrets.token_urlsafe(32)
        redis_client.setex(f"{_EXPORT_TOKEN_PREFIX}{token}", _EXPORT_TTL, f"{company_id}|{ref}")

        api_base = os.getenv("API_BASE_URL", "http://localhost:8000").rstrip("/")
        link = f"{api_base}/api/company/{company_id}/export/download?token={token}"
        if requester and requester.email:
            html = f"""
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
              <h2>Exportação de dados pronta</h2>
              <p>Olá {requester.name}, a exportação completa dos dados da {company.name} está pronta.</p>
              <p style="margin-top:20px"><a href="{link}" style="background:#4F46E5;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none">Baixar export (.zip)</a></p>
              <p style="color:#888;font-size:12px;margin-top:20px">O link expira em 24 horas e exige login de administrador.</p>
            </div>"""
            NotificationService.send_email(requester.email, "Seu export de dados — Radar Comercial", html)

        logger.info("data.export.built", extra={"company_id": company_id, "ref": ref})
    except Exception as exc:
        logger.error("data.export.error", extra={"company_id": company_id, "error": str(exc)}, exc_info=True)
        raise self.retry(exc=exc, countdown=60)
    finally:
        db.close()
