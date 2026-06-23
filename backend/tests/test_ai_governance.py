"""
Governança de custo da geração de mensagens por IA.

Invariante: existe um teto diário por empresa (Redis) que limita quantas
gerações via Claude Haiku uma empresa dispara por dia — cache hits não contam.
O teto degrada para "liberado" se o Redis cair (disponibilidade > teto).
"""
import uuid

import pytest

from app.infrastructure.redis_client import redis_client

try:
    redis_client.ping()
    _REDIS_AVAILABLE = True
except Exception:
    _REDIS_AVAILABLE = False

pytestmark = pytest.mark.skipif(
    not _REDIS_AVAILABLE, reason="Redis necessário para o teto de cota de IA"
)


def test_teto_diario_bloqueia_apos_limite(monkeypatch):
    """Dentro do teto retorna True; ao exceder, False."""
    from app.api import opportunities as opp

    monkeypatch.setattr(opp, "_DAILY_LIMIT", 2)
    company_id = f"quota_co_{uuid.uuid4().hex[:8]}"

    assert opp._within_daily_quota(company_id) is True   # 1ª geração
    assert opp._within_daily_quota(company_id) is True   # 2ª geração
    assert opp._within_daily_quota(company_id) is False  # 3ª excede


def test_teto_zero_desabilita(monkeypatch):
    """_DAILY_LIMIT <= 0 desabilita o teto (sempre liberado)."""
    from app.api import opportunities as opp

    monkeypatch.setattr(opp, "_DAILY_LIMIT", 0)
    company_id = f"quota_off_{uuid.uuid4().hex[:8]}"

    for _ in range(5):
        assert opp._within_daily_quota(company_id) is True


def test_teto_isola_por_empresa(monkeypatch):
    """O contador de uma empresa não consome a cota de outra."""
    from app.api import opportunities as opp

    monkeypatch.setattr(opp, "_DAILY_LIMIT", 1)
    co_a = f"quota_a_{uuid.uuid4().hex[:8]}"
    co_b = f"quota_b_{uuid.uuid4().hex[:8]}"

    assert opp._within_daily_quota(co_a) is True   # A: 1ª
    assert opp._within_daily_quota(co_a) is False  # A: excede
    assert opp._within_daily_quota(co_b) is True   # B: própria cota intacta
