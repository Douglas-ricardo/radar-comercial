"""
FIX 5 — Score de recuperabilidade (recovery_score): índice 0-100 por regras,
transparente e explicável (NÃO é ML/probabilidade). Estes testes travam:
- a regularidade real (CV dos gaps entre compras),
- os 4 fatores ponderados + faixa + motivos,
- o score IDÊNTICO entre a lista de oportunidades e o perfil (fonte única),
- a ordenação escolhida pelo usuário (value | recovery | priority).
"""
from datetime import date, timedelta

import polars as pl

from data_engine.etl import (
    purchase_regularity,
    recovery_score,
    generate_dynamic_insights,
    build_customer_profiles,
)
from app.api.insights import _sort_opportunities


# ─── purchase_regularity ──────────────────────────────────────────────────────

def test_regularity_perfeitamente_regular_proximo_de_1():
    dates = [date(2025, 1, 1) + timedelta(days=30 * i) for i in range(6)]
    assert purchase_regularity(dates) >= 0.99


def test_regularity_muito_irregular_e_baixa():
    base = date(2025, 1, 1)
    # gaps wildly diferentes (1, 100, 2, 200) → CV alto → regularidade baixa
    dates = [base, base + timedelta(days=1), base + timedelta(days=101),
             base + timedelta(days=103), base + timedelta(days=303)]
    assert purchase_regularity(dates) < 0.5


def test_regularity_menos_de_duas_datas_zero():
    assert purchase_regularity([]) == 0.0
    assert purchase_regularity([date(2025, 1, 1)]) == 0.0


# ─── recovery_score ───────────────────────────────────────────────────────────

def test_recovery_score_padaria_vs_alfa():
    # Padaria: ciclo mensal, saiu há 2.5 ciclos, regular, profunda e saudável até sumir.
    padaria = recovery_score(75, 30.0, 0.9, rev_recent=5000.0, rev_before=5000.0, frequency=18, span_days=510)
    # Alfa: ciclo semanal, sumiu há 20 ciclos → recência despenca, banda menor.
    alfa = recovery_score(140, 7.0, 0.9, rev_recent=5000.0, rev_before=5000.0, frequency=40, span_days=273)

    assert 0 <= padaria["recoveryScore"] <= 100
    assert padaria["recoveryScore"] > alfa["recoveryScore"]  # justifica a feature
    # Curva de recência suavizada (FIX 5.1): 2.5 ciclos ainda é recuperável → Padaria "alta".
    assert padaria["recoveryBand"] == "alta"
    assert alfa["recoveryBand"] != "alta"
    assert "sumiu há vários ciclos (difícil reativar)" in alfa["recoveryReasons"]


def test_recency_curva_suavizada_em_2_5_ciclos():
    # ratio 2.5 → f_recency ~0.57 (ainda recuperável), não mais comprimido para baixo.
    rs = recovery_score(75, 30.0, 0.9, rev_recent=1000.0, rev_before=1000.0, frequency=10, span_days=300)
    assert 0.5 <= rs["recoveryFactors"]["recency"] <= 0.65


def test_recovery_score_cliente_em_queda_tem_motivo():
    # rev_recent << rev_before → declinava ANTES de sumir → recuperação difícil.
    rs = recovery_score(40, 30.0, 0.5, rev_recent=100.0, rev_before=1000.0, frequency=5, span_days=150)
    assert "já vinha desacelerando antes de parar" in rs["recoveryReasons"]


def test_recovery_score_sumiu_saudavel_tem_motivo_oposto():
    # rev_recent >= rev_before → vinha saudável e sumiu → sinal POSITIVO de recuperação.
    rs = recovery_score(40, 30.0, 0.8, rev_recent=1500.0, rev_before=1000.0, frequency=8, span_days=200)
    assert "sumiu sem dar sinais (vinha saudável)" in rs["recoveryReasons"]
    assert rs["recoveryFactors"]["trend"] >= 0.7


def test_recovery_score_estavel_ate_lpd_nao_marca_desaceleracao():
    # O bug do FIX 5: cliente estável até a última compra NÃO deve marcar "desacelerando".
    rs = recovery_score(40, 30.0, 0.8, rev_recent=1000.0, rev_before=1000.0, frequency=6, span_days=180)
    assert "já vinha desacelerando antes de parar" not in rs["recoveryReasons"]
    assert rs["recoveryFactors"]["trend"] == 0.5


def test_recovery_score_sem_base_de_comparacao_trend_neutro():
    # rev_before = 0 → sem base → f_trend neutro (0.5), sem motivo de tendência.
    rs = recovery_score(40, 30.0, 0.8, rev_recent=500.0, rev_before=0.0, frequency=2, span_days=60)
    assert rs["recoveryFactors"]["trend"] == 0.5
    assert "já vinha desacelerando antes de parar" not in rs["recoveryReasons"]
    assert "sumiu sem dar sinais (vinha saudável)" not in rs["recoveryReasons"]


def test_recovery_score_clamps_e_no_maximo_3_motivos():
    # Caso "ótimo": saiu no ciclo, regular, crescendo, profundo → reasons podem passar de 3.
    rs = recovery_score(20, 30.0, 1.0, rev_recent=2000.0, rev_before=1000.0, frequency=20, span_days=600)
    assert 0 <= rs["recoveryScore"] <= 100
    assert len(rs["recoveryReasons"]) <= 3
    # Score nunca estoura mesmo com entradas extremas.
    extreme = recovery_score(0, 1.0, 5.0, rev_recent=1e9, rev_before=1.0, frequency=10_000, span_days=10_000)
    assert 0 <= extreme["recoveryScore"] <= 100


# ─── Dados sintéticos determinísticos (estáveis no tempo) ─────────────────────

def _build_alfa_padaria_df() -> pl.DataFrame:
    """
    Arquivo defasado (estável): Ancora compra no max_date; Alfa (semanal, parou há
    140d) e Padaria (mensal, parou há 75d) viram oportunidades churned. Datas fixas
    no passado → reference_date = max_date → scores independem da data de hoje.
    """
    D0 = date(2025, 6, 1)
    rows = [{"date": D0, "customer_id": "Ancora", "product_id": "X", "revenue": 100.0, "qty": 1.0}]
    # Alfa — 40 compras semanais terminando em D0-140
    alfa_last = D0 - timedelta(days=140)
    for i in range(40):
        rows.append({"date": alfa_last - timedelta(days=7 * i), "customer_id": "Alfa",
                     "product_id": "Insumo", "revenue": 10000.0, "qty": 1.0})
    # Padaria — 18 compras mensais terminando em D0-75
    pad_last = D0 - timedelta(days=75)
    for i in range(18):
        rows.append({"date": pad_last - timedelta(days=30 * i), "customer_id": "Padaria",
                     "product_id": "Farinha", "revenue": 4800.0, "qty": 1.0})
    return pl.DataFrame(rows).with_columns(pl.col("date").cast(pl.Date))


def test_recovery_identico_entre_oportunidade_e_perfil():
    df = _build_alfa_padaria_df()
    ins = generate_dynamic_insights(df, "12m", cycle_days=90)
    assert ins is not None
    profs = {p["customer_name"]: p for p in build_customer_profiles(df, cycle_days=90)}

    for opp in ins["opportunities"]:
        p = profs[opp["customer"]]
        assert opp["recoveryScore"] == p["recoveryScore"]
        assert opp["recoveryBand"] == p["recoveryBand"]
        assert opp["recoveryReasons"] == p["recoveryReasons"]


def test_priority_value_e_expected_vezes_score():
    df = _build_alfa_padaria_df()
    profs = build_customer_profiles(df, cycle_days=90)
    for p in profs:
        if p["status"] in ("at_risk", "churned"):
            esperado = round(p["expected_value"] * (p["recoveryScore"] / 100), 2)
            assert p["priorityValue"] == esperado


# ─── Ordenação escolhida pelo usuário ─────────────────────────────────────────

def test_sort_value_default_preserva_ordem_por_valor():
    df = _build_alfa_padaria_df()
    ins = generate_dynamic_insights(df, "12m", cycle_days=90)
    data = _sort_opportunities({"opportunities": ins["opportunities"]}, "value")
    vals = [o["expectedValue"] for o in data["opportunities"]]
    assert vals == sorted(vals, reverse=True)
    # Alfa (maior valor) vem antes da Padaria no default.
    nomes = [o["customer"] for o in data["opportunities"]]
    assert nomes.index("Alfa") < nomes.index("Padaria")


def test_sort_recovery_coloca_padaria_acima_da_alfa():
    df = _build_alfa_padaria_df()
    ins = generate_dynamic_insights(df, "12m", cycle_days=90)
    data = _sort_opportunities({"opportunities": ins["opportunities"]}, "recovery")
    nomes = [o["customer"] for o in data["opportunities"]]
    # O caso que justifica a feature: Padaria é mais recuperável que Alfa.
    assert nomes.index("Padaria") < nomes.index("Alfa")
    scores = [o["recoveryScore"] for o in data["opportunities"]]
    assert scores == sorted(scores, reverse=True)


def test_sort_priority_ordena_por_valor_vezes_recuperacao():
    df = _build_alfa_padaria_df()
    ins = generate_dynamic_insights(df, "12m", cycle_days=90)
    data = _sort_opportunities({"opportunities": ins["opportunities"]}, "priority")
    prios = [o["priorityValue"] for o in data["opportunities"]]
    assert prios == sorted(prios, reverse=True)
