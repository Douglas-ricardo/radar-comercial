"""
Fonte única de métricas de resultado (app/services/metrics_service.py).

Cobre as três decisões de negócio e o bug "Conversão 100% no dashboard vs 45% na
carteira": dashboard e carteira devem produzir o MESMO número para o mesmo estado.
"""
from datetime import datetime
from types import SimpleNamespace

from app.domain.models import ComputedInsights, CustomerProfile, OpportunityAction, OutreachAttribution
from app.services import metrics_service as ms


# ─── Decisão B — conversão (função pura) ──────────────────────────────────────

def test_conversion_exclui_to_contact():
    # 1 won, 1 contacted, 0 lost → trabalhados=2 → 1/2 = 50%
    assert ms.conversion_rate(won=1, contacted=1, lost=0) == 50.0


def test_conversion_sem_trabalhados_retorna_none():
    # Só "a contatar" (won=contacted=lost=0) → trabalhados=0 → None ("sem contatos")
    assert ms.conversion_rate(0, 0, 0) is None


def test_conversion_todos_ganhos():
    assert ms.conversion_rate(won=3, contacted=0, lost=0) == 100.0


# ─── Decisão A — recuperado manual + automático, sem dupla contagem ───────────

def _won(hash_, value, when):
    return SimpleNamespace(opportunity_id=hash_, expected_value=value, updated_at=when)


def _attr(hash_, value, when):
    return SimpleNamespace(customer_hash=hash_, recovered_value=value, resolved_at=when, contacted_at=when)


def test_recuperado_manual_mais_automatico_distintos():
    won = [_won("A", 100.0, datetime(2026, 1, 1))]
    attrs = [_attr("B", 50.0, datetime(2026, 1, 1))]
    r = ms.recovered_breakdown(won, attrs)
    assert r["total"] == 150.0
    assert r["manual"] == 100.0
    assert r["outreach"] == 50.0


def test_recuperado_mesmo_hash_conta_uma_vez_mais_antigo_vence():
    # Mesmo cliente recuperado manual (02/01) E automático (01/01) → conta UMA vez.
    # Vence o mais antigo: a atribuição automática (01/01).
    won = [_won("h1", 100.0, datetime(2026, 1, 2))]
    attrs = [_attr("h1", 80.0, datetime(2026, 1, 1))]
    r = ms.recovered_breakdown(won, attrs)
    assert r["total"] == 80.0
    assert r["outreach"] == 80.0
    assert r["manual"] == 0.0


def test_recuperado_mesmo_hash_manual_mais_antigo_vence():
    won = [_won("h1", 100.0, datetime(2026, 1, 1))]
    attrs = [_attr("h1", 80.0, datetime(2026, 1, 5))]
    r = ms.recovered_breakdown(won, attrs)
    assert r["total"] == 100.0
    assert r["manual"] == 100.0
    assert r["outreach"] == 0.0


# ─── Integração — endpoint /metrics, e consistência dashboard vs carteira ─────

def _profile(db, company_id, chash, status, expected_value, churn_risk="none", name=None):
    """Cria um CustomerProfile com a fonte única persistida (status/expected_value).
    A partir do FIX da raiz, /metrics calcula potencial/em-risco a partir DAQUI."""
    db.add(CustomerProfile(
        company_id=company_id, customer_hash=chash, customer_name=name or chash,
        status=status, expected_value=expected_value, churn_risk=churn_risk,
    ))
    db.commit()


def _seed(db, company_id):
    """Base canônica: w1 at_risk (300) + l1 churned (200).
    potentialTotal = 500 (todos at_risk+churned); atRisk = 200 (subconjunto churned)."""
    _profile(db, company_id, "w1", "at_risk", 300.0, name="Ganho 1")
    _profile(db, company_id, "l1", "churned", 200.0, name="Perdido 1")
    # ComputedInsights ainda existe para outras telas, mas /metrics NÃO depende mais dele.
    db.add(ComputedInsights(
        company_id=company_id, date_range="1m",
        summary={"lostRevenue": 200.0},
        opportunities=[
            {"customerHash": "w1", "customerName": "Ganho 1", "expectedValue": 300.0},
            {"customerHash": "l1", "customerName": "Perdido 1", "expectedValue": 200.0},
        ],
        charts={},
    ))
    db.commit()


def _action(db, company_id, user_id, opp, value, status, when=None):
    kw = {"updated_at": when} if when is not None else {}  # senão usa o default (utcnow)
    db.add(OpportunityAction(
        company_id=company_id, user_id=user_id,
        opportunity_id=opp, customer_name=opp, expected_value=value, status=status,
        **kw,
    ))
    db.commit()


def test_endpoint_metrics_valores(client, company_a, db):
    company, admin, cookie = company_a["company"], company_a["admin"], company_a["cookie"]
    _seed(db, company.id)
    _action(db, company.id, admin.id, "w1", 300.0, "won")
    _action(db, company.id, admin.id, "l1", 200.0, "lost")

    data = client.get(f"/api/carteira/{company.id}/metrics", cookies=cookie).json()["data"]
    assert data["conversion"] == 50.0            # 1 won / 2 trabalhados
    assert data["recovered"]["total"] == 300.0   # ganho manual
    assert data["recovered"]["manual"] == 300.0
    assert data["atRisk"] == 200.0               # churned (l1) — fonte única persistida
    assert data["potentialTotal"] == 500.0       # todos at_risk+churned (w1+l1)
    assert data["capturePct"] == 60.0            # 300 / 500
    assert data["atRisk"] <= data["potentialTotal"]  # coerência: em risco ⊆ potencial


def test_dashboard_e_carteira_mesma_conversao(client, company_a, db):
    """Bug 100% vs 45%: o MESMO estado deve dar a MESMA conversão nas duas telas."""
    company, admin, cookie = company_a["company"], company_a["admin"], company_a["cookie"]
    _seed(db, company.id)
    _action(db, company.id, admin.id, "w1", 300.0, "won")
    _action(db, company.id, admin.id, "l1", 200.0, "lost")

    # Dashboard consome /metrics; ranking da carteira usa a mesma fórmula pura.
    metrics = client.get(f"/api/carteira/{company.id}/metrics", cookies=cookie).json()["data"]
    ranking = client.get(f"/api/carteira/{company.id}/ranking", cookies=cookie).json()["data"]

    assert metrics["conversion"] == 50.0
    assert ranking[0]["conversionRate"] == 50.0
    assert metrics["conversion"] == ranking[0]["conversionRate"]


def test_endpoint_sem_contatos_conversao_none(client, company_a, db):
    company, admin, cookie = company_a["company"], company_a["admin"], company_a["cookie"]
    _seed(db, company.id)
    # Só "a contatar" → nenhum trabalhado.
    _action(db, company.id, admin.id, "w1", 300.0, "to_contact")

    data = client.get(f"/api/carteira/{company.id}/metrics", cookies=cookie).json()["data"]
    assert data["conversion"] is None
    assert data["worked"] == 0
    assert data["recovered"]["total"] == 0.0


# ─── PASSO 3 — base de potencial/captura correta (lacunas do QA #3 e #4) ───────

def test_potential_inclui_todos_nao_so_top15(client, company_a, db):
    """potentialTotal soma TODOS os at_risk/churned, não o top-15 de exibição.
    20 oportunidades de 100 → 2000 (não 1500). O [:15] do ETL é só recorte de UI."""
    company, cookie = company_a["company"], company_a["cookie"]
    for i in range(20):
        _profile(db, company.id, f"opp{i:02d}", "at_risk", 100.0)
    # ComputedInsights truncado a 15 (como o ETL faz) — /metrics deve IGNORAR essa base.
    db.add(ComputedInsights(
        company_id=company.id, date_range="1m", summary={"lostRevenue": 0.0},
        opportunities=[{"customerHash": f"opp{i:02d}", "expectedValue": 100.0} for i in range(15)],
        charts={},
    ))
    db.commit()

    data = client.get(f"/api/carteira/{company.id}/metrics", cookies=cookie).json()["data"]
    assert data["potentialTotal"] == 2000.0   # 20×100, não 15×100


def test_capture_nunca_excede_100(client, company_a, db):
    """capturePct é limitado a 100% mesmo quando o recuperado (won) excede o potencial
    corrente (cliente recuperado pode ter saído da base / won acima do recuperável)."""
    company, admin, cookie = company_a["company"], company_a["admin"], company_a["cookie"]
    _profile(db, company.id, "c1", "at_risk", 100.0)   # potencial = 100
    _action(db, company.id, admin.id, "c1", 900.0, "won")  # recuperado = 900

    data = client.get(f"/api/carteira/{company.id}/metrics", cookies=cookie).json()["data"]
    assert data["potentialTotal"] == 100.0
    assert data["recovered"]["total"] == 900.0
    assert data["capturePct"] == 100.0   # clamp, não 900%


# ─── PASSO 4 — gerencial determinístico e consistente com /metrics ────────────

def test_gerencial_e_metrics_mesmo_won_multiusuario(client, company_a, analyst_a, db):
    """Mesmo opp_id trabalhado por 2 usuários: o tiebreak (mais recente por updated_at)
    é o MESMO em /gerencial e /metrics → mesmo won. Antes era não-determinístico."""
    company, admin, cookie = company_a["company"], company_a["admin"], company_a["cookie"]
    analyst = analyst_a["user"]
    _seed(db, company.id)
    # Dois usuários agem sobre w1: analista marcou 'lost' (antigo), admin 'won' (recente).
    _action(db, company.id, analyst.id, "w1", 300.0, "lost", when=datetime(2026, 1, 1))
    _action(db, company.id, admin.id, "w1", 300.0, "won", when=datetime(2026, 6, 1))

    metrics = client.get(f"/api/carteira/{company.id}/metrics", cookies=cookie).json()["data"]
    gerencial = client.get(f"/api/carteira/{company.id}/gerencial", cookies=cookie).json()["data"]

    assert metrics["won"] == 1                       # 'won' (mais recente) vence
    assert gerencial["totals"]["won"] == metrics["won"]


# ─── PASSO 2 — churn-risk lê expected_value persistido (== Carteira) ──────────

def test_churn_risk_usa_expected_value_persistido(client, company_a, db):
    """O endpoint churn-risk devolve o expected_value canônico PERSISTIDO — não recalcula
    total_revenue/frequency. Mesmo cliente → mesmo expectedValue da Carteira/Insights."""
    company, cookie = company_a["company"], company_a["cookie"]
    db.add(CustomerProfile(
        company_id=company.id, customer_hash="ch1", customer_name="Churn 1",
        status="at_risk", expected_value=777.0, churn_risk="high",
        total_revenue=10000.0, rfv={"frequency": 3},  # 10000/3≈3333 seria o valor ERRADO antigo
    ))
    db.commit()

    data = client.get(f"/api/insights/{company.id}/churn-risk", cookies=cookie).json()["data"]
    row = next(c for c in data["customers"] if c["customerHash"] == "ch1")
    assert row["expectedValue"] == 777.0   # persistido, não 3333.33
