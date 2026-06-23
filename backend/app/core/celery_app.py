# app/core/celery_app.py
import os

# macOS fork-safety: polars/pyarrow criam threadpools nativos no import.
# O pool prefork do Celery faz fork() e herda esse estado, causando SIGSEGV
# ao processar o arquivo. Esta flag torna o fork seguro no macOS; é inofensiva
# em Linux (produção), onde o prefork funciona normalmente.
os.environ.setdefault("OBJC_DISABLE_INITIALIZE_FORK_SAFETY", "YES")

from celery import Celery
from celery.schedules import crontab
from dotenv import load_dotenv

load_dotenv()

# Observabilidade nos workers também (degrada sem SENTRY_DSN).
from app.core.observability import configure_logging, init_sentry
configure_logging()
init_sentry()

REDIS_URL = os.getenv("CELERY_BROKER_URL")
if not REDIS_URL:
    raise ValueError("A variável CELERY_BROKER_URL não foi encontrada no .env")

celery_app = Celery(
    "radar_comercial_worker",
    broker=REDIS_URL,
    backend=REDIS_URL,
    include=["app.workers.tasks", "app.workers.notification_tasks", "app.workers.sync_tasks", "app.workers.outreach_tasks", "app.workers.webhook_tasks", "app.workers.campaign_tasks", "app.workers.compliance_tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="America/Sao_Paulo",
    enable_utc=True,
    task_track_started=True,
    task_time_limit=3600,
    broker_connection_retry_on_startup=True,
    beat_schedule={
        "send-daily-notifications": {
            "task": "send_daily_notifications",
            "schedule": crontab(hour=11, minute=0),  # 11:00 UTC = 08:00 BRT
        },
        "auto-sync-all-sheets": {
            "task": "auto_sync_all_sheets",
            "schedule": crontab(minute=0),  # todo início de hora
        },
        "send-daily-outreach": {
            "task": "send_daily_outreach",
            "schedule": crontab(minute=5),  # toda hora; a task filtra por send_hour
        },
        "process-cadence-steps": {
            "task": "process_cadence_steps",
            "schedule": crontab(minute="*/15"),  # a cada 15 min; processa passos vencidos
        },
        "send-scheduled-reports": {
            "task": "send_scheduled_reports",
            "schedule": crontab(hour=10, minute=0),  # 10:00 UTC = 07:00 BRT
        },
        "purge-old-audit-logs": {
            "task": "purge_old_audit_logs",
            "schedule": crontab(hour=4, minute=30),  # 04:30 UTC diário
        },
    },
)