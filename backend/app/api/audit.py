# app/api/audit.py
import csv
import io
import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.auth import get_current_user_and_company
from app.domain.models import AuditLog
from app.infrastructure.database import get_db_session

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/audit", tags=["Audit"])


def _parse_date(value: str | None) -> datetime | None:
    if not value:
        return None
    for fmt in ("%Y-%m-%d", "%Y-%m-%dT%H:%M:%S"):
        try:
            return datetime.strptime(value, fmt)
        except ValueError:
            continue
    return None


def _apply_filters(q, company_id, action, user_id, date_from, date_to):
    q = q.filter(AuditLog.company_id == company_id)
    if action:
        q = q.filter(AuditLog.action.ilike(f"%{action}%"))
    if user_id:
        q = q.filter(AuditLog.user_id == user_id)
    df = _parse_date(date_from)
    dt = _parse_date(date_to)
    if df:
        q = q.filter(AuditLog.created_at >= df)
    if dt:
        q = q.filter(AuditLog.created_at <= dt)
    return q


@router.get("/{company_id}/log")
def list_audit_log(
    company_id: str,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    action: str | None = Query(default=None),
    user_id: str | None = Query(default=None),
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    token=Depends(get_current_user_and_company),
    db: Session = Depends(get_db_session),
):
    if str(token.company_id) != company_id:
        raise HTTPException(status_code=403, detail="Acesso negado.")
    if token.role != "admin":
        raise HTTPException(status_code=403, detail="Apenas administradores podem visualizar o log de auditoria.")

    q = _apply_filters(db.query(AuditLog), company_id, action, user_id, date_from, date_to)
    total = q.count()
    logs = q.order_by(AuditLog.created_at.desc()).offset(offset).limit(limit).all()

    return {
        "success": True,
        "data": [
            {
                "id": log.id,
                "userId": log.user_id,
                "userName": log.user_name,
                "action": log.action,
                "resourceType": log.resource_type,
                "resourceId": log.resource_id,
                "details": log.details or {},
                "ip": log.ip,
                "userAgent": log.user_agent,
                "createdAt": log.created_at.isoformat() if log.created_at else None,
            }
            for log in logs
        ],
        "pagination": {"total": total, "limit": limit, "offset": offset},
    }


@router.get("/{company_id}/export")
def export_audit_csv(
    company_id: str,
    action: str | None = Query(default=None),
    user_id: str | None = Query(default=None),
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    token=Depends(get_current_user_and_company),
    db: Session = Depends(get_db_session),
):
    """Exporta o log de auditoria filtrado em CSV (até 50k linhas)."""
    if str(token.company_id) != company_id:
        raise HTTPException(status_code=403, detail="Acesso negado.")
    if token.role != "admin":
        raise HTTPException(status_code=403, detail="Apenas administradores.")

    q = _apply_filters(db.query(AuditLog), company_id, action, user_id, date_from, date_to)
    logs = q.order_by(AuditLog.created_at.desc()).limit(50000).all()

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["timestamp", "action", "user_id", "user_name", "resource_type", "resource_id", "ip", "user_agent", "details"])
    for log in logs:
        writer.writerow([
            log.created_at.isoformat() if log.created_at else "",
            log.action, log.user_id or "", log.user_name or "",
            log.resource_type or "", log.resource_id or "",
            log.ip or "", log.user_agent or "",
            str(log.details or {}),
        ])
    buf.seek(0)
    stamp = datetime.now().strftime("%Y-%m-%d")
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="auditoria-{stamp}.csv"'},
    )
