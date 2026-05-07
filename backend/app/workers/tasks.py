# app/workers/tasks.py
import logging
import os
from datetime import datetime

from app.core.celery_app import celery_app
from app.infrastructure.database import SessionLocal
from app.infrastructure.redis_client import redis_client
from app.domain.models import UploadedFile, AnalysisResult, ComputedInsights, CustomerProfile
from data_engine.etl import process_sales_pipeline

logger = logging.getLogger(__name__)


@celery_app.task(bind=True, max_retries=3)
def process_sales_file(self, file_id: str, company_id: str, local_file_path: str):
    logger.info("worker.task.start", extra={"file_id": file_id, "company_id": company_id})

    db = SessionLocal()
    should_delete_file = True  # default: deleta após processar
    try:
        result = process_sales_pipeline(local_file_path, company_id)

        # ── ComputedInsights: upsert per (company_id, date_range) ─────────────
        for date_range, insights in result["insights_by_range"].items():
            existing = (
                db.query(ComputedInsights)
                .filter_by(company_id=company_id, date_range=date_range)
                .first()
            )
            if existing:
                existing.summary = insights["summary"]
                existing.opportunities = insights["opportunities"]
                existing.charts = insights["charts"]
                existing.computed_at = datetime.utcnow()
            else:
                db.add(ComputedInsights(
                    company_id=company_id,
                    date_range=date_range,
                    summary=insights["summary"],
                    opportunities=insights["opportunities"],
                    charts=insights["charts"],
                ))

        # ── CustomerProfile: replace all profiles for this company ────────────
        db.query(CustomerProfile).filter_by(company_id=company_id).delete()
        db.bulk_save_objects([
            CustomerProfile(
                company_id=company_id,
                customer_hash=p["customer_hash"],
                customer_name=p["customer_name"],
                total_revenue=p["total_revenue"],
                percentage=p["percentage"],
                last_purchase_date=p["last_purchase_date"],
                recency_days=p["recency_days"],
                trend=p["trend"],
                segment=p["segment"],
                rfv=p["rfv"],
                top_products=p["top_products"],
                monthly_revenue=p["monthly_revenue"],
                alerts=p["alerts"],
            )
            for p in result["customer_profiles"]
        ])

        # ── AnalysisResult: summary for history view ──────────────────────────
        db.add(AnalysisResult(
            file_id=file_id,
            company_id=company_id,
            total_revenue=result["total_revenue"],
            lost_revenue=result["lost_revenue"],
            opportunities_count=result["opportunities_count"],
            active_customers=result["unique_customers"],
            analyzed_products=result["unique_products"],
        ))

        # ── Mark file as completed ────────────────────────────────────────────
        db_file = db.query(UploadedFile).filter(UploadedFile.id == file_id).first()
        if db_file:
            db_file.status = "completed"
            db_file.error_message = None

        db.commit()

        # Invalidate Redis insights cache for all date ranges
        _invalidate_insights_cache(company_id)

        logger.info(
            "worker.task.success",
            extra={
                "file_id": file_id,
                "total_revenue": result["total_revenue"],
                "opportunities": result["opportunities_count"],
                "customers": result["unique_customers"],
            },
        )
        return {"status": "success", "file_id": file_id}

    except ValueError as exc:
        # Invalid file — no retry
        db.rollback()
        logger.warning("worker.task.validation_error", extra={"file_id": file_id, "error": str(exc)})
        _mark_failed(db, file_id, str(exc))
        return {"status": "failed", "file_id": file_id, "error": str(exc)}

    except Exception as exc:
        # Transient error — retry with backoff
        db.rollback()
        logger.error("worker.task.error", extra={"file_id": file_id, "error": str(exc)}, exc_info=True)
        _mark_failed(db, file_id, f"Erro interno: {str(exc)}")
        try:
            # Não deleta o arquivo: precisamos dele para a próxima tentativa
            should_delete_file = False
            raise self.retry(exc=exc, countdown=60)
        except self.MaxRetriesExceededError:
            # Esgotou retries — pode deletar o arquivo agora
            should_delete_file = True
            raise

    finally:
        db.close()
        if should_delete_file:
            _delete_raw_file(local_file_path)


def _delete_raw_file(path: str) -> None:
    if path and os.path.exists(path):
        try:
            os.remove(path)
            logger.info("worker.file.deleted", extra={"path": path})
        except OSError as exc:
            logger.warning("worker.file.delete_error", extra={"path": path, "error": str(exc)})


def _invalidate_insights_cache(company_id: str) -> None:
    try:
        for dr in ("1m", "3m", "6m", "12m"):
            redis_client.delete(f"insights:{company_id}:{dr}")
    except Exception as exc:
        logger.warning("worker.redis.invalidate_error", extra={"company_id": company_id, "error": str(exc)})


def _mark_failed(db, file_id: str, message: str) -> None:
    db_file = db.query(UploadedFile).filter(UploadedFile.id == file_id).first()
    if db_file:
        db_file.status = "failed"
        db_file.error_message = message
        db.commit()
