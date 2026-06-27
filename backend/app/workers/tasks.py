# app/workers/tasks.py
import logging
import os
from datetime import datetime
from app.core.clock import utcnow

from app.core.celery_app import celery_app
from app.infrastructure.database import SessionLocal
from app.infrastructure.redis_client import redis_client
from app.infrastructure import storage
from app.domain.models import UploadedFile, AnalysisResult, ComputedInsights, CustomerProfile, Company, ContactOptOut
from sqlalchemy import update
from data_engine.etl import process_sales_pipeline

logger = logging.getLogger(__name__)

# Lock de ETL: evita race entre uploads concorrentes da mesma empresa.
# TTL aumentado para suportar arquivos grandes (até 500 MB).
_ETL_LOCK_TTL = int(os.getenv("ETL_LOCK_TTL", "1800"))  # 30 min (env-override)
_ETL_LOCK_WAIT = 5

# Opt-in: retém o arquivo de origem após o ETL para permitir reprocessamento.
# Padrão FALSE = não reter transação bruta (decisão LGPD). Ligar conscientemente.
_RETAIN_SOURCE = os.getenv("RETAIN_SOURCE_FILES", "false").lower() == "true"


def customer_profile_row(company_id: str, p: dict, *, preserved=(None, None, False), opted_out=frozenset()) -> CustomerProfile:
    """Mapeia o dict de perfil (saída de build_customer_profiles) para a linha CustomerProfile.

    Inclui a FONTE ÚNICA persistida (status/expected_value/recovery_*), preserva contato/opt-out
    entre reprocessos. Extraído para testar o mapeamento sem rodar a task inteira.
    `preserved` = (phone, email, opt_out) da versão anterior; `opted_out` = hashes em opt-out durável.
    """
    old_phone, old_email, old_opt_out = preserved
    return CustomerProfile(
        company_id=company_id,
        customer_hash=p["customer_hash"],
        customer_name=p["customer_name"],
        phone=p.get("phone") or old_phone,
        email=p.get("email") or old_email,
        contact_opt_out=bool(old_opt_out) or (p["customer_hash"] in opted_out),
        document_id=p.get("document_id"),
        branch=p.get("branch"),
        salesperson=p.get("salesperson"),
        total_revenue=p["total_revenue"],
        percentage=p["percentage"],
        last_purchase_date=p["last_purchase_date"],
        recency_days=p["recency_days"],
        avg_interval_days=p.get("avg_interval_days", 0.0),
        churn_risk=p.get("churn_risk", "none"),
        churn_score=p.get("churn_score", 0),
        trend=p["trend"],
        segment=p["segment"],
        # Fonte única (classify_customer_status / recovery_score) — persistida para que
        # churn-risk, disparo e métricas leiam o MESMO valor, sem recalcular ad-hoc.
        status=p.get("status"),
        expected_value=p.get("expected_value", 0.0),
        recovery_score=p.get("recoveryScore", 0),
        recovery_band=p.get("recoveryBand"),
        priority_value=p.get("priorityValue", 0.0),
        rfv=p["rfv"],
        top_products=p["top_products"],
        monthly_revenue=p["monthly_revenue"],
        alerts=p["alerts"],
    )


@celery_app.task(bind=True, max_retries=3, soft_time_limit=1500, time_limit=1800)
def process_sales_file(self, file_id: str, company_id: str, file_ref: str):
    """
    file_ref pode ser um path local (fallback) ou "r2://<key>" (object storage).
    O worker baixa para um path local antes de processar e limpa ao final.
    """
    logger.info("worker.task.start", extra={"file_id": file_id, "company_id": company_id})

    lock = redis_client.lock(f"etl_lock:{company_id}", timeout=_ETL_LOCK_TTL, blocking_timeout=_ETL_LOCK_WAIT)
    if not lock.acquire():
        # Outro upload da mesma empresa está em processamento — re-enfileira.
        logger.info("worker.task.lock_busy", extra={"file_id": file_id, "company_id": company_id})
        raise self.retry(countdown=30)

    db = SessionLocal()
    should_delete_file = True  # default: deleta após processar
    local_file_path = None
    try:
        # fetch dentro do try: se falhar, o finally ainda libera lock e fecha a sessão
        local_file_path = storage.fetch_to_local(file_ref)
        company_obj = db.query(Company).filter(Company.id == company_id).first()
        cycle_days = company_obj.purchase_cycle_days if company_obj else 90
        result = process_sales_pipeline(local_file_path, company_id, cycle_days=cycle_days)

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
                existing.computed_at = utcnow()
            else:
                db.add(ComputedInsights(
                    company_id=company_id,
                    date_range=date_range,
                    summary=insights["summary"],
                    opportunities=insights["opportunities"],
                    charts=insights["charts"],
                ))

        # ── CustomerProfile: replace all profiles for this company ────────────
        # Antes de apagar, preserva contatos/opt-out já existentes (cadastro
        # manual do vendedor não pode ser perdido no re-upload). O upload vence
        # para phone/email quando os traz; senão mantém o valor preservado.
        # contact_opt_out é sempre preservado (decisão humana).
        preserved = {
            row.customer_hash: (row.phone, row.email, row.contact_opt_out)
            for row in db.query(
                CustomerProfile.customer_hash,
                CustomerProfile.phone,
                CustomerProfile.email,
                CustomerProfile.contact_opt_out,
            ).filter_by(company_id=company_id).all()
        }
        # Opt-out durável (LGPD): fonte de verdade que sobrevive ao rebuild mesmo
        # quando o cliente sumiu do CSV anterior e reapareceu agora.
        opted_out = {
            r[0] for r in db.query(ContactOptOut.customer_hash)
            .filter_by(company_id=company_id).all()
        }
        db.query(CustomerProfile).filter_by(company_id=company_id).delete()
        new_profiles = [
            customer_profile_row(
                company_id, p,
                preserved=preserved.get(p["customer_hash"], (None, None, False)),
                opted_out=opted_out,
            )
            for p in result["customer_profiles"]
        ]
        db.bulk_save_objects(new_profiles)

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

        # Retenção opt-in da fonte (habilita reprocessar sem novo upload).
        if _RETAIN_SOURCE:
            should_delete_file = False

        # ── Loop fechado: resolve atribuições de receita recuperada ───────────
        # Os perfis acabaram de ser reconstruídos com os dados novos; verifica
        # quais clientes contatados voltaram a comprar.
        try:
            from app.services.outreach_service import resolve_attributions
            resolve_attributions(db, company_id)
        except Exception as exc:
            logger.warning("worker.attribution.error", extra={"company_id": company_id, "error": str(exc)})

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
        try:
            lock.release()
        except Exception:
            # lock pode ter expirado por TTL — não é erro fatal
            pass

        if storage.is_remote_ref(file_ref):
            # A cópia local baixada é sempre descartável (re-baixa em retry).
            if local_file_path:
                storage.cleanup_local(local_file_path)
            if should_delete_file:
                storage.delete(file_ref)
        elif should_delete_file:
            _delete_raw_file(file_ref)


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
        # Reverte o contador — upload falhou, não deve contar contra a cota.
        db.execute(
            update(Company)
            .where(Company.id == db_file.company_id, Company.uploads_used > 0)
            .values(uploads_used=Company.uploads_used - 1)
        )
        db.commit()
