# app/workers/crm_tasks.py
"""Sync bidirecional com CRM: pull de contatos (enriquece CustomerProfile) e push de deals."""
import logging

from app.core.celery_app import celery_app
from app.core.clock import utcnow
from app.infrastructure.database import SessionLocal
from app.domain.models import CrmConnection, CustomerProfile
from app.services.crm import base as crm_base
from data_engine.etl import normalize_phone_br

logger = logging.getLogger(__name__)


@celery_app.task(name="sync_crm_contacts", bind=True, max_retries=2, ignore_result=True)
def sync_crm_contacts(self, connection_id: str):
    """Puxa contatos do CRM e enriquece CustomerProfile (telefone/e-mail) por e-mail
    ou nome. Não cria clientes novos — apenas completa contatos faltantes."""
    db = SessionLocal()
    try:
        conn = db.query(CrmConnection).filter_by(id=connection_id).first()
        if not conn or not conn.enabled:
            return
        creds = crm_base.decrypt_credentials(conn.credentials)
        connector = crm_base.get_connector(conn.provider, creds, conn.field_map)

        contacts = connector.fetch_contacts(limit=500)
        enriched = 0
        # Índices em memória dos perfis da empresa para casar por e-mail/nome.
        profiles = db.query(CustomerProfile).filter_by(company_id=conn.company_id).all()
        by_email = {p.email.lower(): p for p in profiles if p.email}
        by_name = {p.customer_name.strip().lower(): p for p in profiles if p.customer_name}

        for ct in contacts:
            email = (ct.get("email") or "").strip().lower() or None
            name = (ct.get("name") or "").strip().lower() or None
            phone = ct.get("phone")
            prof = (by_email.get(email) if email else None) or (by_name.get(name) if name else None)
            if not prof:
                continue
            changed = False
            if email and not prof.email:
                prof.email = email
                changed = True
            if phone and not prof.phone:
                prof.phone = normalize_phone_br(phone)
                changed = True
            if changed:
                enriched += 1

        conn.last_sync_at = utcnow()
        conn.last_sync_status = "ok"
        conn.last_sync_error = None
        db.commit()
        logger.info("crm.sync.done", extra={"connection_id": connection_id, "enriched": enriched, "fetched": len(contacts)})
    except Exception as exc:
        logger.error("crm.sync.error", extra={"connection_id": connection_id, "error": str(exc)}, exc_info=True)
        try:
            conn = db.query(CrmConnection).filter_by(id=connection_id).first()
            if conn:
                conn.last_sync_at = utcnow()
                conn.last_sync_status = "error"
                conn.last_sync_error = str(exc)[:300]
                db.commit()
        except Exception:
            pass
    finally:
        db.close()


@celery_app.task(name="push_crm_deal", bind=True, max_retries=2, ignore_result=True)
def push_crm_deal(self, company_id: str, payload: dict):
    """Empurra um negócio ganho/perdido para todos os CRMs com push habilitado."""
    db = SessionLocal()
    try:
        conns = db.query(CrmConnection).filter_by(company_id=company_id, enabled=True, push_enabled=True).all()
        for conn in conns:
            try:
                creds = crm_base.decrypt_credentials(conn.credentials)
                connector = crm_base.get_connector(conn.provider, creds, conn.field_map)
                connector.push_deal(payload)
            except Exception as exc:
                logger.warning("crm.push.error", extra={"connection_id": conn.id, "error": str(exc)})
    finally:
        db.close()
