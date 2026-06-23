# app/core/observability.py
"""
Logging central + Sentry. Tudo opcional/degradável: sem SENTRY_DSN não ativa
nada (igual às outras integrações). PII desligada por padrão (LGPD).
"""
import logging
import os

logger = logging.getLogger(__name__)

_LOG_FORMAT = "%(asctime)s %(levelname)s %(name)s %(message)s"


def configure_logging() -> None:
    level = os.getenv("LOG_LEVEL", "INFO").upper()
    logging.basicConfig(level=getattr(logging, level, logging.INFO), format=_LOG_FORMAT)
    # silencia ruído de libs verbosas
    for noisy in ("httpx", "urllib3"):
        logging.getLogger(noisy).setLevel(logging.WARNING)


def init_sentry() -> bool:
    """Ativa Sentry se SENTRY_DSN estiver setado e o SDK instalado."""
    dsn = os.getenv("SENTRY_DSN")
    if not dsn:
        return False
    try:
        import sentry_sdk
    except ImportError:
        logger.warning("observability.sentry.sdk_ausente")
        return False
    sentry_sdk.init(
        dsn=dsn,
        environment=os.getenv("SENTRY_ENVIRONMENT", "production"),
        traces_sample_rate=float(os.getenv("SENTRY_TRACES_SAMPLE_RATE", "0.0")),
        # auto-instrumenta FastAPI/Starlette/SQLAlchemy/Celery/Redis quando presentes
        send_default_pii=False,
    )
    logger.info("observability.sentry.ativo")
    return True
