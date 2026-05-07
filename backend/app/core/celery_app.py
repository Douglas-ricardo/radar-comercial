# app/core/celery_app.py
import os
from celery import Celery
from celery.schedules import crontab
from dotenv import load_dotenv

load_dotenv()

REDIS_URL = os.getenv("CELERY_BROKER_URL")
if not REDIS_URL:
    raise ValueError("A variável CELERY_BROKER_URL não foi encontrada no .env")

celery_app = Celery(
    "radar_comercial_worker",
    broker=REDIS_URL,
    backend=REDIS_URL,
    include=["app.workers.tasks", "app.workers.notification_tasks"],
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
    },
)