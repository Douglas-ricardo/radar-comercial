"""Registro de auditoria de ações importantes (governança, compliance, debug)."""
import logging
from typing import Any

from sqlalchemy.orm import Session

from app.domain.models import AuditLog

logger = logging.getLogger(__name__)


def log_action(
    db: Session,
    company_id: str,
    action: str,
    user_id: str | None = None,
    user_name: str | None = None,
    resource_type: str | None = None,
    resource_id: str | None = None,
    details: dict[str, Any] | None = None,
) -> None:
    """Insere um registro de auditoria de forma best-effort (não bloqueia a operação principal)."""
    try:
        db.add(AuditLog(
            company_id=company_id,
            user_id=user_id,
            user_name=user_name,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            details=details or {},
        ))
        db.flush()
    except Exception as exc:
        logger.warning("audit.log.error", extra={"action": action, "error": str(exc)})
