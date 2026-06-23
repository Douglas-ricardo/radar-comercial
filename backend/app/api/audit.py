# app/api/audit.py
import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.auth import get_current_user_and_company
from app.domain.models import AuditLog
from app.infrastructure.database import get_db_session

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/audit", tags=["Audit"])


@router.get("/{company_id}/log")
def list_audit_log(
    company_id: str,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    action: str | None = Query(default=None),
    token=Depends(get_current_user_and_company),
    db: Session = Depends(get_db_session),
):
    if str(token.company_id) != company_id:
        raise HTTPException(status_code=403, detail="Acesso negado.")
    if token.role != "admin":
        raise HTTPException(status_code=403, detail="Apenas administradores podem visualizar o log de auditoria.")

    q = db.query(AuditLog).filter_by(company_id=company_id)
    if action:
        q = q.filter(AuditLog.action.ilike(f"%{action}%"))

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
                "createdAt": log.created_at.isoformat() if log.created_at else None,
            }
            for log in logs
        ],
        "pagination": {"total": total, "limit": limit, "offset": offset},
    }
