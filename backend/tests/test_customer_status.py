"""
FIX 4 — fonte de verdade única para status comercial e valor recuperável.

`classify_customer_status` é a ÚNICA régua consumida por `generate_dynamic_insights`
(lista de oportunidades + KPIs) e por `build_customer_profiles` (perfil/alertas).
Estes testes travam o novo comportamento: status por múltiplos do ciclo efetivo,
valor recuperável por ciclo (não avg_ticket), e o MESMO expectedValue nas duas telas.
"""
from datetime import date, timedelta

import polars as pl

from data_engine.etl import (
    classify_customer_status,
    effective_cycle_days,
    recoverable_value,
    generate_dynamic_insights,
    build_customer_profiles,
    process_sales_pipeline,
)


# ─── effective_cycle_days ─────────────────────────────────────────────────────

def test_effective_cycle_usa_intervalo_proprio_quando_ha_ritmo():
    # freq >= 3 e intervalo válido → usa o ciclo do próprio cliente.
    assert effective_cycle_days(30.0, 5, 90) == 30.0
    assert effective_cycle_days(7.0, 40, 90) == 7.0


def test_effective_cycle_cai_para_global_quando_poucas_compras():
    # freq < 3 → não há ritmo confiável → ciclo global da empresa.
    assert effective_cycle_days(320.0, 2, 90) == 90.0
    assert effective_cycle_days(15.0, 1, 90) == 90.0


def test_effective_cycle_cai_para_global_quando_intervalo_invalido():
    assert effective_cycle_days(0.0, 10, 90) == 90.0
    assert effective_cycle_days(None, 10, 120) == 120.0  # type: ignore[arg-type]


# ─── recoverable_value ────────────────────────────────────────────────────────

def test_recoverable_value_e_receita_por_ciclo():
    # 12 compras mensais somando 12000 ao longo de ~337 dias (ciclo ~30.6) → ~11 ciclos.
    assert recoverable_value(12000.0, 337, 30.6) == round(12000.0 / 11, 2)


def test_recoverable_value_nao_subvaloriza_recorrente_valioso():
    # Anti-inversão: no modelo antigo (avg_ticket / total*0.2) um recorrente de alto
    # valor podia "valer" menos que um esporádico fraco. Com a régua por ciclo isso
    # não acontece — a grande conta recorrente vale mais por ciclo.
    recorrente_valioso = recoverable_value(120000.0, 337, 30.6)
    esporadico_fraco = recoverable_value(2000.0, 180, 90.0)
    assert recorrente_valioso > esporadico_fraco


def test_recoverable_value_edge_cases():
    assert recoverable_value(0.0, 100, 30) == 0.0       # sem receita
    assert recoverable_value(-5.0, 100, 30) == 0.0      # receita negativa
    assert recoverable_value(1000.0, 100, 0) == 1000.0  # ciclo 0 → 1 ciclo
    assert recoverable_value(1000.0, 0, 30) == 1000.0   # span 0 → 1 ciclo


# ─── classify_customer_status (cenários do gabarito narrativa.csv) ─────────────

def test_status_construtora_em_dia_active():
    # Construtora: ciclo trimestral, recency dentro do ciclo → active (sai da lista).
    st = classify_customer_status(70, 90.0, 8, 67406.75, 630)
    assert st["status"] == "active"


def test_status_padaria_atrasada_entra():
    # Padaria: ciclo mensal (30d), parou há 75d (> 1.5×30) → churned (entra).
    st = classify_customer_status(75, 30.0, 18, 87470.33, 510)
    assert st["status"] in ("at_risk", "churned")


def test_status_alfa_sumiu_churned():
    # Distribuidora Alfa: ciclo semanal (7d), parou há 140d → churned (entra).
    st = classify_customer_status(140, 7.0, 40, 419217.20, 273)
    assert st["status"] == "churned"


def test_status_restaurante_recente_active():
    # Restaurante: ciclo semanal (7d), comprou há 5d → active (fora da lista).
    st = classify_customer_status(5, 7.0, 30, 52530.87, 203)
    assert st["status"] == "active"


def test_status_poucas_compras_usa_ciclo_global():
    # Mercadinho: freq < 3 → ciclo global 90; recency 80 ≤ 90 → active (fora).
    st = classify_customer_status(80, 320.0, 2, 215.00, 320)
    assert st["status"] == "active"
    assert st["eff_cycle"] == 90.0


def test_status_expoe_eff_cycle_e_days_overdue():
    st = classify_customer_status(75, 30.0, 18, 87470.33, 510)
    assert st["eff_cycle"] == 30.0
    assert st["days_overdue"] == 45  # 75 - 30


# ─── Integração: MESMO expectedValue nas duas telas ────────────────────────────

def _build_two_customer_df() -> pl.DataFrame:
    """
    Recorrente: 12 compras mensais de 1000 (total 12000), última em 2026-02-01.
    Recente: 3 compras recentes, última em 2026-06-01 — define o file_max e empurra
    a recency do Recorrente acima do ciclo (vira churned em ambos os caminhos).
    Uma compra por data → n_purchases (insights) == frequency (perfil).
    """
    rows = []
    # Recorrente — primeiro dia de cada mês, mar/2025 a fev/2026
    months = [(2025, m) for m in range(3, 13)] + [(2026, 1), (2026, 2)]
    for (y, m) in months:
        rows.append({"date": date(y, m, 1), "customer_id": "Recorrente",
                     "product_id": "Farinha", "revenue": 1000.0, "qty": 1.0})
    # Recente — define file_max em 2026-06-01
    for d in (date(2026, 4, 1), date(2026, 5, 1), date(2026, 6, 1)):
        rows.append({"date": d, "customer_id": "Recente",
                     "product_id": "Acucar", "revenue": 500.0, "qty": 1.0})
    return pl.DataFrame(rows).with_columns(pl.col("date").cast(pl.Date))


def test_expected_value_identico_entre_lista_e_perfil():
    df = _build_two_customer_df()

    insights = generate_dynamic_insights(df, "12m", cycle_days=90)
    assert insights is not None
    opp = next(o for o in insights["opportunities"] if o["customer"] == "Recorrente")

    profiles = build_customer_profiles(df, cycle_days=90)
    prof = next(p for p in profiles if p["customer_name"] == "Recorrente")
    assert prof["alerts"], "perfil do Recorrente deveria ter alerta (churned)"

    # A régua única garante o MESMO valor recuperável nas duas telas.
    assert opp["expectedValue"] == prof["alerts"][0]["expectedValue"]


def test_persistencia_popula_fonte_unica_e_bate_com_oportunidade(db, company_a):
    """PASSO 1 (raiz): após o mapeamento REAL de persistência (customer_profile_row),
    o CustomerProfile tem status/expected_value/recovery populados, e o expected_value
    persistido é IDÊNTICO ao expectedValue da lista de oportunidades para o mesmo cliente."""
    from app.workers.tasks import customer_profile_row
    from app.domain.models import CustomerProfile

    cid = company_a["company"].id
    df = _build_two_customer_df()
    insights = generate_dynamic_insights(df, "12m", cycle_days=90)
    opp = next(o for o in insights["opportunities"] if o["customer"] == "Recorrente")
    profiles = build_customer_profiles(df, cycle_days=90)

    # Persiste pelo MESMO mapeamento usado pela task (sem duplicar lógica).
    db.query(CustomerProfile).filter_by(company_id=cid).delete()
    db.bulk_save_objects([customer_profile_row(cid, p) for p in profiles])
    db.commit()

    row = db.query(CustomerProfile).filter_by(company_id=cid, customer_name="Recorrente").first()
    assert row is not None
    assert row.status == "churned"                 # fonte única persistida
    assert row.expected_value > 0
    assert row.recovery_score >= 0 and row.recovery_band in ("alta", "media", "baixa")
    # Consistência ponta-a-ponta: valor persistido == valor da oportunidade (sem recálculo).
    assert row.expected_value == opp["expectedValue"]


def test_cliente_active_nao_vira_oportunidade():
    df = _build_two_customer_df()
    insights = generate_dynamic_insights(df, "12m", cycle_days=90)
    assert insights is not None
    nomes = {o["customer"] for o in insights["opportunities"]}
    assert "Recente" not in nomes      # active → fora da lista
    assert "Recorrente" in nomes       # churned → entra


def test_oportunidades_ordenadas_por_valor_recuperavel():
    df = _build_two_customer_df()
    insights = generate_dynamic_insights(df, "12m", cycle_days=90)
    assert insights is not None
    vals = [o["expectedValue"] for o in insights["opportunities"]]
    assert vals == sorted(vals, reverse=True)


# ─── FIX 4.1 — summary do AnalysisResult derivado da fonte única ──────────────

def _build_three_customer_df() -> pl.DataFrame:
    """Como _build_two_customer_df, mas adiciona EmRisco (at_risk) para separar
    'perdido' (churned) de 'oportunidade' (at_risk + churned). file_max = 2026-06-01.
      - Recente:    active   (fora da lista)
      - EmRisco:    at_risk  (recency 35d, ciclo ~29.5d → 1.0–1.5×)
      - Recorrente: churned  (parou em fev/2026)
    """
    df = _build_two_customer_df()
    em_risco = []
    for d in (date(2026, 2, 27), date(2026, 3, 27), date(2026, 4, 27)):
        em_risco.append({"date": d, "customer_id": "EmRisco",
                         "product_id": "Sal", "revenue": 800.0, "qty": 1.0})
    extra = pl.DataFrame(em_risco).with_columns(pl.col("date").cast(pl.Date))
    return pl.concat([df, extra])


def test_analysis_result_derives_from_single_source(tmp_path):
    """
    O summary do AnalysisResult vem da fonte única (status dos profiles), não do corte
    legado de 60d. FIX #4: 'perdido' e 'oportunidade' são conjuntos DIFERENTES —
      - lost_revenue = expected_value só dos CHURNED (bate com summary.lostRevenue da
        Visão Geral e com metrics_service.atRisk).
      - opportunities_count = at_risk + churned.
    Trava a regressão do "telas se contradizem" (mesmo nome 'perdida', número diferente).
    """
    csv_path = tmp_path / "vendas.csv"
    _build_three_customer_df().write_csv(csv_path)

    result = process_sales_pipeline(str(csv_path), "test-co", cycle_days=90)
    profiles = result["customer_profiles"]

    at_risk = [p for p in profiles if p["status"] == "at_risk"]
    churned = [p for p in profiles if p["status"] == "churned"]
    assert at_risk and churned, "fixture precisa de at_risk E churned para o teste valer"

    expected_count = len(at_risk) + len(churned)
    expected_lost = round(sum(p["expected_value"] for p in churned), 2)

    # opportunities_count = at_risk + churned
    assert result["opportunities_count"] == expected_count
    # lost_revenue = SÓ churned (não inclui at_risk)
    assert result["lost_revenue"] == expected_lost
    # e a distinção é real: incluir at_risk daria um número MAIOR (o bug antigo).
    bug_antigo = round(sum(p["expected_value"] for p in at_risk + churned), 2)
    assert result["lost_revenue"] < bug_antigo
    # a definição de status existe em todo profile de saída
    assert all("status" in p and "expected_value" in p for p in profiles)


def test_avg_interval_identico_entre_insights_e_profile():
    """
    FIX #3: o intervalo médio (e portanto eff_cycle/status/expected_value) é calculado
    pela MESMA régua (average_interval_days) nos dois caminhos — sem divergência por
    arredondamento. O expectedValue da oportunidade bate com o do profile bit a bit.
    """
    df = _build_three_customer_df()
    insights = generate_dynamic_insights(df, "12m", cycle_days=90)
    profiles = build_customer_profiles(df, cycle_days=90)
    assert insights is not None

    for nome in ("EmRisco", "Recorrente"):
        opp = next(o for o in insights["opportunities"] if o["customer"] == nome)
        prof = next(p for p in profiles if p["customer_name"] == nome)
        assert opp["expectedValue"] == prof["expected_value"]
        assert opp["recoveryScore"] == prof["recoveryScore"]
