# app/infrastructure/redis_client.py
import logging
import os

import redis

logger = logging.getLogger(__name__)

# Usa REDIS_URL como variável canônica.
# CELERY_BROKER_URL pode apontar para a mesma instância — documente isso no .env.example.
# Se quiser Redis separado para cache e broker, defina REDIS_URL diferente de CELERY_BROKER_URL.
_redis_url = os.getenv("REDIS_URL") or os.getenv("CELERY_BROKER_URL", "redis://localhost:6379")

redis_client = redis.from_url(
    _redis_url,
    decode_responses=True,
    # Pool de conexões: evita criar nova conexão por thread sob carga.
    max_connections=20,
    # Timeouts: evita requests pendurados se o Redis estiver lento.
    socket_connect_timeout=5,
    socket_timeout=5,
)

logger.info("redis.client.initialized", extra={"url": _redis_url.split("@")[-1]})  # omite credenciais