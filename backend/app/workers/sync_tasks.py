# app/workers/sync_tasks.py
import csv
import io
import logging
import uuid
from datetime import datetime, timedelta, timezone
from app.core.clock import utcnow
from pathlib import Path
import os

from app.core.celery_app import celery_app
from app.infrastructure.database import SessionLocal
from app.infrastructure import storage
from app.domain.models import Company, IntegrationConfig, UploadedFile
from app.workers.tasks import process_sales_file

logger = logging.getLogger(__name__)

_TEMP_DIR = Path(os.getenv("TEMP_DIR", str(Path(__file__).resolve().parent.parent.parent / "temp")))
_SYNC_INTERVAL_HOURS = int(os.getenv("SHEETS_SYNC_INTERVAL_HOURS", "6"))


# ── Google Sheets sync ────────────────────────────────────────────────────────

@celery_app.task(name="sync_google_sheet", bind=True, max_retries=2)
def sync_google_sheet(self, company_id: str, config_id: str):
    """
    Pulls data from a Google Sheets spreadsheet and dispatches the same
    ETL pipeline used for manual CSV uploads.
    Requires GOOGLE_SERVICE_ACCOUNT_JSON env var (JSON string of service account credentials).
    """
    db = SessionLocal()
    cfg = None
    try:
        cfg = db.query(IntegrationConfig).filter_by(id=config_id, company_id=company_id).first()
        if not cfg or not cfg.enabled:
            return {"skipped": True, "reason": "config disabled or not found"}

        sheet_url = cfg.config.get("sheet_url", "")
        sheet_name = cfg.config.get("sheet_name") or 0  # 0 = first sheet

        if not sheet_url:
            _mark_error(db, cfg, "sheet_url não configurada")
            return {"error": "sheet_url missing"}

        sa_json = os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON")
        if not sa_json:
            _mark_error(db, cfg, "GOOGLE_SERVICE_ACCOUNT_JSON não configurada")
            logger.warning("sync.google_sheets.no_credentials", extra={"company_id": company_id})
            return {"error": "no credentials"}

        import json
        import gspread
        from google.oauth2.service_account import Credentials

        scopes = [
            "https://www.googleapis.com/auth/spreadsheets.readonly",
            "https://www.googleapis.com/auth/drive.readonly",
        ]
        creds = Credentials.from_service_account_info(json.loads(sa_json), scopes=scopes)
        gc = gspread.authorize(creds)

        try:
            sh = gc.open_by_url(sheet_url)
            if isinstance(sheet_name, int):
                ws = sh.get_worksheet(sheet_name)
            else:
                ws = sh.worksheet(sheet_name)
            rows = ws.get_all_values()
        except Exception as exc:
            _mark_error(db, cfg, f"Erro ao acessar planilha: {exc}")
            raise self.retry(exc=exc, countdown=300)

        if len(rows) < 2:
            _mark_error(db, cfg, "Planilha vazia ou sem dados além do cabeçalho")
            return {"error": "empty sheet"}

        # Serializa para CSV temporário e dispara o pipeline normal
        _TEMP_DIR.mkdir(parents=True, exist_ok=True)
        tmp_path = str(_TEMP_DIR / f"sheets_{company_id}_{uuid.uuid4().hex[:8]}.csv")
        with open(tmp_path, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerows(rows)

        file_record = UploadedFile(
            company_id=company_id,
            filename=f"google_sheets_sync_{utcnow().strftime('%Y%m%d_%H%M%S')}.csv",
            status="pending",
        )
        db.add(file_record)
        db.commit()
        db.refresh(file_record)

        file_ref = storage.store_from_local(tmp_path, f"sheets/{company_id}/{file_record.id}.csv")
        process_sales_file.delay(file_record.id, company_id, file_ref)

        cfg.last_sync_at = utcnow()
        cfg.last_sync_status = "ok"
        cfg.last_sync_error = None
        db.commit()

        logger.info("sync.google_sheets.dispatched", extra={
            "company_id": company_id, "rows": len(rows) - 1, "file_id": file_record.id,
        })
        return {"success": True, "rows": len(rows) - 1, "file_id": file_record.id}

    except Exception as exc:
        if cfg:
            _mark_error(db, cfg, str(exc))
        logger.error("sync.google_sheets.error", extra={"company_id": company_id, "error": str(exc)}, exc_info=True)
        raise self.retry(exc=exc, countdown=300)
    finally:
        db.close()


def _mark_error(db, cfg: IntegrationConfig, error: str):
    try:
        cfg.last_sync_at = utcnow()
        cfg.last_sync_status = "error"
        cfg.last_sync_error = error[:500]
        db.commit()
    except Exception:
        pass


# ── Auto-sync scheduler ───────────────────────────────────────────────────────

@celery_app.task(name="auto_sync_all_sheets")
def auto_sync_all_sheets():
    """
    Runs every hour via Celery Beat. Finds all enabled Google Sheets integrations
    whose last_sync_at is older than SHEETS_SYNC_INTERVAL_HOURS and dispatches sync.
    """
    db = SessionLocal()
    dispatched = 0
    try:
        threshold = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=_SYNC_INTERVAL_HOURS)
        configs = (
            db.query(IntegrationConfig)
            .filter(
                IntegrationConfig.type == "google_sheets",
                IntegrationConfig.enabled == True,
            )
            .all()
        )
        for cfg in configs:
            if cfg.last_sync_at is None or cfg.last_sync_at < threshold:
                sync_google_sheet.delay(cfg.company_id, cfg.id)
                dispatched += 1

        logger.info("sync.auto_sync_all.complete", extra={"dispatched": dispatched, "total": len(configs)})
        return {"dispatched": dispatched}
    except Exception as exc:
        logger.error("sync.auto_sync_all.error", extra={"error": str(exc)}, exc_info=True)
        return {"error": str(exc)}
    finally:
        db.close()
