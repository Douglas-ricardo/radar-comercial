"""Gestão de sessões duráveis — registro, revogação e cache de revogação no Redis.

Cada login cria uma UserSession e embute o `sid` no JWT. A cada request, validamos
que a sessão não foi revogada. Para não bater no banco a cada chamada, cacheamos o
estado de revogação no Redis (chave curta, TTL 5 min) — o banco é a fonte de verdade.
"""
import logging
from datetime import datetime

from sqlalchemy.orm import Session

from app.core.clock import utcnow
from app.domain.models import UserSession
from app.infrastructure.redis_client import redis_client

logger = logging.getLogger(__name__)

_REVOKED_PREFIX = "sess_revoked:"
_REVOKED_TTL = 300  # 5 min


def create_session(db: Session, user_id: str, company_id: str, ip: str | None, user_agent: str | None) -> str:
    """Cria uma sessão durável e retorna o session_id (sid) para embutir no JWT."""
    sess = UserSession(
        user_id=user_id,
        company_id=company_id,
        ip=ip,
        user_agent=(user_agent or "")[:300] or None,
    )
    db.add(sess)
    db.commit()
    db.refresh(sess)
    return sess.id


def is_session_revoked(db: Session, sid: str) -> bool:
    """True se a sessão foi revogada. Cache Redis com fallback no banco."""
    cache_key = f"{_REVOKED_PREFIX}{sid}"
    try:
        cached = redis_client.get(cache_key)
        if cached is not None:
            return cached == "1"
    except Exception:
        pass

    sess = db.query(UserSession).filter(UserSession.id == sid).first()
    revoked = (sess is None) or (sess.revoked_at is not None)
    try:
        redis_client.setex(cache_key, _REVOKED_TTL, "1" if revoked else "0")
    except Exception:
        pass
    return revoked


def revoke_session(db: Session, sid: str) -> None:
    sess = db.query(UserSession).filter(UserSession.id == sid).first()
    if sess and sess.revoked_at is None:
        sess.revoked_at = utcnow()
        db.commit()
    try:
        redis_client.setex(f"{_REVOKED_PREFIX}{sid}", _REVOKED_TTL, "1")
    except Exception:
        pass
