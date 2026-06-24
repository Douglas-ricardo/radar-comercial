# app/core/rate_limit.py
import os

from slowapi import Limiter
from slowapi.util import get_remote_address


def _client_ip(request) -> str:
    """
    Chave do rate limit. Atrás de proxy/load balancer (Render, Fly, nginx) o IP
    real vem no X-Forwarded-For; usamos o primeiro da cadeia. Sem proxy, cai no
    IP direto do socket.
    """
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    return get_remote_address(request)


# Storage: usa Redis quando disponível (compartilha contadores entre instâncias);
# senão memória local (dev / instância única).
_redis_url = os.getenv("REDIS_URL") or os.getenv("CELERY_BROKER_URL")

limiter = Limiter(
    key_func=_client_ip,
    storage_uri=_redis_url if _redis_url else "memory://",
    # Expõe X-RateLimit-Limit/Remaining/Reset nas respostas das rotas limitadas.
    headers_enabled=True,
)
