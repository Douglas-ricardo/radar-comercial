"""
Recência viva (app/services/live_recency.py): "dias sem comprar" recalculado
contra hoje na LEITURA, gated por frescor da base — mas SÓ os dias; valores,
status, recuperabilidade e prioridade das oportunidades ficam intactos.
"""
from datetime import date, datetime, timedelta

from app.services import live_recency
from app.services.live_recency import live_recency_days, refresh_days_inactive


def _iso(d: date) -> str:
    return d.isoformat()


# ── refresh_days_inactive (caminho dos insights/notificações/IA) ──────────────

def test_dias_sobem_com_dado_fresco():
    today = date(2026, 7, 7)
    dataset_max = _iso(today - timedelta(days=2))  # empresa tem compra recente
    opps = [
        {"customer": "recente", "lastPurchase": _iso(today - timedelta(days=2)), "daysInactive": 1},
        {"customer": "sumido", "lastPurchase": _iso(today - timedelta(days=50)), "daysInactive": 40},
    ]
    out = refresh_days_inactive(opps, dataset_max, today=today, window=7)
    assert out[0]["daysInactive"] == 2    # base fresca → recalcula
    assert out[1]["daysInactive"] == 50   # recalculado contra hoje (era 40 gravado)


def test_dataset_max_da_empresa_nao_das_oportunidades():
    """Regressão: os ativos (que seguram o feed fresco) NÃO entram nas oportunidades.
    O frescor deve vir do dataset_max da EMPRESA — senão nunca ticaria."""
    today = date(2026, 7, 7)
    # Nenhuma oportunidade é recente (a mais nova tem 40 dias), mas a EMPRESA
    # comprou ontem (ativo fora da lista) → base fresca → deve recalcular.
    dataset_max = _iso(today - timedelta(days=1))
    opps = [
        {"customer": "sumido", "lastPurchase": _iso(today - timedelta(days=40)), "daysInactive": 40},
    ]
    out = refresh_days_inactive(opps, dataset_max, today=today, window=7)
    assert out[0]["daysInactive"] == 40
    # amanhã, mesma base fresca → tica para 41
    out2 = refresh_days_inactive(opps, dataset_max, today=today + timedelta(days=1), window=7)
    assert out2[0]["daysInactive"] == 41


def test_congela_com_dado_velho():
    today = date(2026, 7, 7)
    dataset_max = _iso(today - timedelta(days=30))  # empresa inteira está velha
    opps = [
        {"customer": "a", "lastPurchase": _iso(today - timedelta(days=30)), "daysInactive": 23},
        {"customer": "b", "lastPurchase": _iso(today - timedelta(days=60)), "daysInactive": 53},
    ]
    out = refresh_days_inactive(opps, dataset_max, today=today, window=7)
    # dataset_max = hoje-30 (> janela) → NADA muda: mantém os valores gravados.
    assert out[0]["daysInactive"] == 23
    assert out[1]["daysInactive"] == 53
    assert out is opps  # devolve a lista original intacta


def test_so_os_dias_mudam_resto_intacto():
    today = date(2026, 7, 7)
    opp = {
        "customer": "x",
        "lastPurchase": _iso(today - timedelta(days=5)),
        "daysInactive": 3,
        "expectedValue": 1234.56,
        "status": "at_risk",
        "recoveryScore": 72,
        "recoveryBand": "alta",
        "priorityValue": 888.0,
    }
    out = refresh_days_inactive([opp], _iso(today - timedelta(days=5)), today=today, window=7)[0]
    assert out["daysInactive"] == 5  # só o dia mudou
    for k in ("expectedValue", "status", "recoveryScore", "recoveryBand", "priorityValue"):
        assert out[k] == opp[k]


def test_lastpurchase_nulo_fica_intacto():
    today = date(2026, 7, 7)
    opps = [
        {"customer": "fresco", "lastPurchase": _iso(today - timedelta(days=3)), "daysInactive": 2},
        {"customer": "sem_data", "daysInactive": 99},  # sem lastPurchase
    ]
    out = refresh_days_inactive(opps, _iso(today - timedelta(days=3)), today=today, window=7)
    assert out[0]["daysInactive"] == 3
    assert out[1]["daysInactive"] == 99  # sem data → não recalcula


def test_lista_vazia_ou_none():
    dm = date(2026, 7, 7).isoformat()
    assert refresh_days_inactive([], dm, today=date(2026, 7, 7)) == []
    assert refresh_days_inactive(None, dm, today=date(2026, 7, 7)) is None


def test_nao_muta_o_dict_original():
    today = date(2026, 7, 7)
    opp = {"lastPurchase": _iso(today - timedelta(days=5)), "daysInactive": 3}
    refresh_days_inactive([opp], _iso(today - timedelta(days=5)), today=today, window=7)
    assert opp["daysInactive"] == 3  # original preservado (row.opportunities do SQLAlchemy)


# ── live_recency_days (caminho escalar do outreach) ───────────────────────────

def test_escalar_fresco_recalcula():
    today = date(2026, 7, 7)
    d = live_recency_days(
        _iso(today - timedelta(days=50)), 40, _iso(today - timedelta(days=2)),
        today=today, window=7,
    )
    assert d == 50


def test_escalar_velho_usa_gravado():
    today = date(2026, 7, 7)
    d = live_recency_days(
        _iso(today - timedelta(days=50)), 40, _iso(today - timedelta(days=30)),
        today=today, window=7,
    )
    assert d == 40


def test_escalar_last_purchase_nulo():
    today = date(2026, 7, 7)
    d = live_recency_days(None, 40, _iso(today), today=today, window=7)
    assert d == 40


def test_data_futura_faz_clamp_em_zero():
    today = date(2026, 7, 7)
    d = live_recency_days(
        _iso(today + timedelta(days=5)), 40, _iso(today), today=today, window=7,
    )
    assert d == 0  # max(0, dias negativos)


# ── janela configurável + today padrão ────────────────────────────────────────

def test_janela_via_env(monkeypatch):
    monkeypatch.setenv("RECENCY_FRESHNESS_WINDOW_DAYS", "14")
    today = date(2026, 7, 7)
    opps = [{"lastPurchase": _iso(today - timedelta(days=10)), "daysInactive": 6}]
    # dataset_max = hoje-10: velho p/ janela 7, mas FRESCO p/ 14 (do env).
    out = refresh_days_inactive(opps, _iso(today - timedelta(days=10)), today=today)  # sem window → usa env
    assert out[0]["daysInactive"] == 10


def test_today_default_usa_utcnow(monkeypatch):
    fixed = datetime(2026, 7, 7, 12, 0, 0)
    monkeypatch.setattr(live_recency, "utcnow", lambda: fixed)
    opps = [{"lastPurchase": _iso(date(2026, 7, 5)), "daysInactive": 1}]
    out = refresh_days_inactive(opps, _iso(date(2026, 7, 5)), window=7)  # sem today → usa utcnow().date()
    assert out[0]["daysInactive"] == 2
