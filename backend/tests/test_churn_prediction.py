"""
P3 — churn preditivo (ml/churn.py + integração ETL + endpoint).
"""
from ml.churn import assess_churn_risk
from app.domain.models import CustomerProfile


# ── unit: heurística ──────────────────────────────────────────────────────────

def test_cliente_muito_atrasado_risco_alto():
    # compra a cada 20 dias, está há 35 dias sem comprar (ratio 1.75) → high
    r = assess_churn_risk(recency_days=35, avg_interval_days=20.0, frequency=6)
    assert r["risk"] == "high"
    assert r["days_overdue"] == 15


def test_cliente_levemente_atrasado_risco_baixo_ou_medio():
    # ratio 1.1 → low ; ratio 1.25 → medium
    assert assess_churn_risk(22, 20.0, 6)["risk"] == "low"
    assert assess_churn_risk(25, 20.0, 6)["risk"] == "medium"


def test_cliente_em_dia_sem_risco():
    # comprou há 10 dias, cadência de 20 → dentro do esperado → none
    assert assess_churn_risk(10, 20.0, 6)["risk"] == "none"


def test_historico_insuficiente_nao_preve():
    # só 2 compras → sem cadência confiável
    assert assess_churn_risk(40, 20.0, 2)["risk"] == "none"


def test_ja_churned_nao_e_preditivo():
    # recência > 60 (já sumiu) → tratado pelo churn reativo, não preditivo
    assert assess_churn_risk(90, 20.0, 6)["risk"] == "none"


# ── ETL produz churn_risk ─────────────────────────────────────────────────────

def test_etl_calcula_churn_risk():
    import polars as pl
    from datetime import date, timedelta
    from data_engine.etl import build_customer_profiles, _normalize_customer_names

    hoje = date.today()
    # "Atrasado": compra a cada ~15 dias, mas última foi há 35 dias (overdue, não churned).
    # "Ativo": comprou hoje → garante que o max_date do arquivo é recente,
    # de modo que a recência do "Atrasado" seja medida corretamente (35 dias).
    atrasado = [hoje - timedelta(days=d) for d in (35, 50, 65, 80, 95)]
    rows = []
    for d in atrasado:
        rows.append({"date": d, "customer_id": "Atrasado Ltda", "product_id": "P", "revenue": 100.0, "qty": 1.0})
    rows.append({"date": hoje, "customer_id": "Ativo SA", "product_id": "P", "revenue": 100.0, "qty": 1.0})
    df = pl.DataFrame(rows)
    df = _normalize_customer_names(df)
    profiles = build_customer_profiles(df)
    atrasado_prof = next(p for p in profiles if "Atrasado" in p["customer_name"])
    assert atrasado_prof["churn_risk"] in ("low", "medium", "high")
    assert atrasado_prof["avg_interval_days"] > 0


# ── endpoint ──────────────────────────────────────────────────────────────────

def test_endpoint_churn_risk(client, db, company_a):
    cid = company_a["company"].id
    db.add(CustomerProfile(
        company_id=cid, customer_hash="churn_h1", customer_name="Risco Alto",
        segment="loyal", recency_days=40, avg_interval_days=20.0,
        churn_risk="high", churn_score=90, total_revenue=2000.0, rfv={"frequency": 5},
    ))
    db.commit()
    r = client.get(f"/api/insights/{cid}/churn-risk", cookies=company_a["cookie"])
    assert r.status_code == 200
    data = r.json()["data"]
    assert data["counts"]["high"] >= 1
    assert any(c["customerHash"] == "churn_h1" for c in data["customers"])


def test_endpoint_churn_risk_cross_tenant_403(client, company_a, company_b):
    r = client.get(f"/api/insights/{company_a['company'].id}/churn-risk", cookies=company_b["cookie"])
    assert r.status_code == 403
