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

def test_analysis_result_derives_from_single_source(tmp_path):
    """
    O summary do AnalysisResult (opportunities_count/lost_revenue) deve vir da fonte
    única — status in (at_risk, churned) dos profiles —, não do corte legado de 60d.
    Trava a regressão que reintroduziria a contradição entre o card de histórico de
    uploads e a Visão Geral/Insights.
    """
    csv_path = tmp_path / "vendas.csv"
    _build_two_customer_df().write_csv(csv_path)

    result = process_sales_pipeline(str(csv_path), "test-co", cycle_days=90)
    profiles = result["customer_profiles"]

    expected_count = sum(1 for p in profiles if p["status"] in ("at_risk", "churned"))
    expected_lost = round(
        sum(p["expected_value"] for p in profiles
            if p["status"] in ("at_risk", "churned")),
        2,
    )

    assert result["opportunities_count"] == expected_count
    assert result["lost_revenue"] == expected_lost
    assert expected_count >= 1  # Recorrente (churned) garante ≥ 1 oportunidade
    # a definição de status existe em todo profile de saída
    assert all("status" in p and "expected_value" in p for p in profiles)
