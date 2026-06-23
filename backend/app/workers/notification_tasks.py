# app/workers/notification_tasks.py
import logging

from app.core.celery_app import celery_app
from app.infrastructure.database import SessionLocal
from app.domain.models import Company, ComputedInsights, NotificationPreference, User
from app.services.notification_service import NotificationService

logger = logging.getLogger(__name__)


@celery_app.task(name="send_daily_notifications", bind=True, max_retries=2)
def send_daily_notifications(self):
    """
    Daily digest dispatched by Celery Beat at 08:00 BRT (11:00 UTC).
    Sends email and/or WhatsApp to users with notifications enabled.
    """
    logger.info("notifications.task.start")
    db = SessionLocal()
    sent = 0
    errors = 0

    try:
        prefs = (
            db.query(NotificationPreference)
            .filter(NotificationPreference.enabled == True)
            .all()
        )

        for pref in prefs:
            try:
                user = db.query(User).filter(
                    User.id == pref.user_id,
                    User.status == "active",
                ).first()

                if not user or user.role not in ("admin", "analyst"):
                    continue

                company = db.query(Company).filter(Company.id == pref.company_id).first()
                if not company:
                    continue

                insights = db.query(ComputedInsights).filter_by(
                    company_id=pref.company_id, date_range="1m"
                ).first()

                if not insights or not insights.opportunities:
                    continue

                opportunities = [
                    opp for opp in insights.opportunities
                    if opp.get("expectedValue", 0) >= pref.min_opportunity_value
                ]

                if not opportunities:
                    continue

                if pref.email_enabled:
                    subject = (
                        f"[Radar Comercial] {len(opportunities)} oportunidades de recuperação"
                        f" — {company.name}"
                    )
                    html = NotificationService.format_opportunity_email(
                        user.name, opportunities, company.name
                    )
                    if NotificationService.send_email(user.email, subject, html):
                        sent += 1

                if pref.whatsapp_enabled and pref.whatsapp_phone:
                    msg = NotificationService.format_opportunity_whatsapp(
                        user.name, opportunities
                    )
                    NotificationService.send_whatsapp(pref.whatsapp_phone, msg)

            except Exception as exc:
                errors += 1
                logger.error(
                    "notifications.task.user_error",
                    extra={"user_id": pref.user_id, "error": str(exc)},
                    exc_info=True,
                )

        logger.info(
            "notifications.task.complete",
            extra={"sent": sent, "errors": errors, "total_prefs": len(prefs)},
        )
        return {"sent": sent, "errors": errors}

    except Exception as exc:
        logger.error("notifications.task.fatal", extra={"error": str(exc)}, exc_info=True)
        raise self.retry(exc=exc, countdown=300)
    finally:
        db.close()
