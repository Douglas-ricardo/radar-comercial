# app/workers/campaign_tasks.py
"""Execução de campanhas de disparo: envia mensagem personalizada a um segmento."""
import logging
import random
import time
from datetime import timedelta

from app.core.celery_app import celery_app
from app.core.clock import utcnow
from app.infrastructure.database import SessionLocal
from app.domain.models import Campaign, CustomerProfile, OutreachConfig, OutreachLog, ContactOptOut

logger = logging.getLogger(__name__)

_MIN_GAP, _MAX_GAP = 8, 25


@celery_app.task(name="run_campaign_task", bind=True, max_retries=1, ignore_result=True)
def run_campaign_task(self, campaign_id: str):
    """Executa o disparo de uma campanha. Respeitando opt-out, dedup 24h e teto de 200/lote."""
    db = SessionLocal()
    try:
        campaign = db.query(Campaign).filter_by(id=campaign_id).first()
        if not campaign or campaign.status not in ("draft", "failed"):
            return

        campaign.status = "sending"
        db.commit()

        config = db.query(OutreachConfig).filter_by(company_id=campaign.company_id).first()

        # Clientes elegíveis
        q = db.query(CustomerProfile).filter(
            CustomerProfile.company_id == campaign.company_id,
            CustomerProfile.contact_opt_out.is_(False),
        )
        if campaign.segment and campaign.segment != "all":
            q = q.filter(CustomerProfile.segment == campaign.segment)
        if campaign.branch:
            q = q.filter(CustomerProfile.branch == campaign.branch)
        if campaign.salesperson:
            q = q.filter(CustomerProfile.salesperson == campaign.salesperson)
        q = q.filter(
            (CustomerProfile.phone.isnot(None)) | (CustomerProfile.email.isnot(None))
        ).order_by(CustomerProfile.total_revenue.desc()).limit(200)

        profiles = q.all()

        # Opt-outs duráveis
        opt_out_hashes = {
            r[0] for r in db.query(ContactOptOut.customer_hash).filter_by(
                company_id=campaign.company_id
            ).all()
        }

        # Dedup 24h
        since = utcnow() - timedelta(hours=24)
        recent = {
            r[0] for r in db.query(OutreachLog.customer_hash).filter(
                OutreachLog.company_id == campaign.company_id,
                OutreachLog.status == "sent",
                OutreachLog.sent_at >= since,
            ).distinct().all()
        }

        campaign.target_count = len(profiles)
        sent = 0

        from app.services import outreach_service, evolution_client
        from app.services.notification_service import NotificationService

        sender_name = (config.sender_name if config else None) or "Equipe de vendas"

        for profile in profiles:
            if profile.customer_hash in opt_out_hashes:
                continue
            if profile.customer_hash in recent:
                continue

            # Substitui variáveis no template
            msg = campaign.message_content
            msg = msg.replace("{customer_name}", profile.customer_name or "")
            msg = msg.replace("{sender_name}", sender_name)

            ok = False

            # WhatsApp
            if config and config.whatsapp_enabled and profile.phone and config.whatsapp_status == "connected":
                try:
                    evolution_client.send_text(config.evolution_instance or campaign.company_id, profile.phone, msg)
                    db.add(OutreachLog(
                        company_id=campaign.company_id,
                        customer_hash=profile.customer_hash,
                        customer_name=profile.customer_name,
                        channel="whatsapp",
                        status="sent",
                    ))
                    ok = True
                except Exception as exc:
                    logger.warning("campaign.whatsapp.error", extra={"error": str(exc)})
                    db.add(OutreachLog(
                        company_id=campaign.company_id,
                        customer_hash=profile.customer_hash,
                        customer_name=profile.customer_name,
                        channel="whatsapp",
                        status="failed",
                        error=str(exc)[:200],
                    ))

            # Email
            if config and config.email_enabled and profile.email:
                try:
                    html = f"<p>{msg.replace(chr(10), '<br>')}</p>"
                    subject = f"Olá {profile.customer_name or ''} — {sender_name}"
                    NotificationService.send_email(profile.email, subject, html)
                    db.add(OutreachLog(
                        company_id=campaign.company_id,
                        customer_hash=profile.customer_hash,
                        customer_name=profile.customer_name,
                        channel="email",
                        status="sent",
                    ))
                    ok = True
                except Exception as exc:
                    logger.warning("campaign.email.error", extra={"error": str(exc)})

            if ok:
                sent += 1
                recent.add(profile.customer_hash)

            db.commit()
            time.sleep(random.uniform(_MIN_GAP, _MAX_GAP))

        campaign.sent_count = sent
        campaign.status = "sent"
        campaign.sent_at = utcnow()
        db.commit()
        logger.info("campaign.run.complete", extra={"campaign_id": campaign_id, "sent": sent})

    except Exception as exc:
        logger.error("campaign.run.error", extra={"campaign_id": campaign_id, "error": str(exc)}, exc_info=True)
        try:
            campaign = db.query(Campaign).filter_by(id=campaign_id).first()
            if campaign:
                campaign.status = "failed"
                db.commit()
        except Exception:
            pass
        raise self.retry(exc=exc, countdown=60)
    finally:
        db.close()
