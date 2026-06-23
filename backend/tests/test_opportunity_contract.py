"""
Contrato do dict de oportunidade gerado pelo ETL.
Garante que as chaves camelCase permaneçam consistentes entre quem produz
(etl.py) e quem consome (notification_service.py, notification_tasks.py, carteira.py).
Se este teste quebrar, o bug de "Cliente / R$ 0,00 / 0 dias" nas notificações vai voltar.
"""
import polars as pl
import pytest
from datetime import date, timedelta

from data_engine.etl import generate_dynamic_insights

REQUIRED_KEYS = {"id", "customerHash", "customer", "product", "type",
                 "lastPurchase", "daysInactive", "frequency", "expectedValue", "confidence"}


@pytest.fixture
def sample_df():
    """
    DataFrame com clientes churned relativo ao max_date do próprio arquivo.
    Com a guarda de defasagem, reference_date = file_max quando o arquivo é antigo.
    Portanto, clientes inativos devem ter última compra > 60 dias ANTES do file_max.
    """
    # active_purchase será o file_max real (maior data no df).
    # limit_active = active_purchase - 60d.
    # Para churned: última compra deve ser < active_purchase - 60d.
    # Usamos 80d de margem para garantir que churned_purchase < limit_active.
    active_purchase = date.today() - timedelta(days=90)    # file_max real do df
    churned_purchase = active_purchase - timedelta(days=80) # 80d antes → inativo há > 60d → churned
    return pl.DataFrame({
        "date": [
            churned_purchase, churned_purchase - timedelta(days=30),  # Cliente A (churned)
            active_purchase,                                            # Cliente B (ativo)
        ],
        "customer_id": ["Cliente A", "Cliente A", "Cliente B"],
        "product_id": ["Produto X", "Produto X", "Produto Y"],
        "revenue": [500.0, 300.0, 800.0],
        "qty": [1.0, 1.0, 2.0],
    })


def test_opportunity_keys_present(sample_df):
    result = generate_dynamic_insights(sample_df, "12m")
    assert result is not None, "ETL não gerou insights para o período"
    assert result["opportunities"], "Nenhuma oportunidade gerada — verifique o threshold de churn"
    for opp in result["opportunities"]:
        missing = REQUIRED_KEYS - opp.keys()
        assert not missing, f"Chaves ausentes no dict de oportunidade: {missing}"


def test_opportunity_no_snake_case_leakage(sample_df):
    """Garante que snake_case não vaze — esses nomes quebravam as notificações."""
    result = generate_dynamic_insights(sample_df, "12m")
    assert result is not None
    for opp in result["opportunities"]:
        assert "customer_name" not in opp, "Chave snake_case 'customer_name' não deve existir"
        assert "expected_value" not in opp, "Chave snake_case 'expected_value' não deve existir"
        assert "days_inactive" not in opp, "Chave snake_case 'days_inactive' não deve existir"


def test_opportunity_values_not_hardcoded(sample_df):
    """Produto e frequência não devem ser os literais hardcoded antigos."""
    result = generate_dynamic_insights(sample_df, "12m")
    assert result is not None
    for opp in result["opportunities"]:
        assert opp["product"] != "Mix de Produtos", \
            "Produto hardcoded 'Mix de Produtos' ainda presente — fix 0.4 não foi aplicado"
        assert opp["frequency"] != "Mensal" or opp["customer"] in ("Cliente A",), \
            "Frequência hardcoded 'Mensal' não deve ser o padrão para todos os clientes"


def test_data_freshness_in_summary(sample_df):
    """data_freshness deve estar presente no summary para exibição na UI."""
    result = generate_dynamic_insights(sample_df, "12m")
    assert result is not None
    assert "dataFreshness" in result["summary"], \
        "Campo dataFreshness ausente no summary — frontend não consegue exibir aviso de dado antigo"
