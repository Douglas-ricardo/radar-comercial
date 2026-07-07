"""
Regressão do FIX 2 — normalização robusta de cabeçalho do ETL.

Antes deste fix o matcher usava `c.lower().strip()`, que não troca espaço por
underscore nem remove sufixos `(R$)`, rejeitando headers comuns de planilha PME
("Data Venda", "Valor (R$)") e sinônimos em inglês ("quantity"/"value").
"""
import polars as pl

from data_engine.etl import _canon_key, _build_rename_map, normalize_columns


def test_canon_key_normaliza_espaco_e_parenteses():
    assert _canon_key("Data Venda") == "data_venda"
    assert _canon_key("Valor (R$)") == "valor"
    assert _canon_key("  Qtd  ") == "qtd"
    assert _canon_key("Preço Total (R$)") == "preco_total"  # acento e sufixo removidos


def test_header_ptbr_com_espaco_maiuscula_parenteses_mapeia():
    df = pl.DataFrame({
        "Data Venda": ["01/01/2024"],
        "Cliente": ["Fulano"],
        "Valor (R$)": [150.0],
    })
    out = normalize_columns(df)
    assert "date" in out.columns
    assert "customer_id" in out.columns
    assert "revenue" in out.columns


def test_header_ingles_mapeia_todas_as_cinco():
    cols = ["date", "customer", "product", "quantity", "value"]
    rename_map = _build_rename_map(cols)
    assert rename_map["date"] == "date"
    assert rename_map["customer"] == "customer_id"
    assert rename_map["product"] == "product_id"
    assert rename_map["quantity"] == "qty"
    assert rename_map["value"] == "revenue"


def test_guard_de_colisao_mantem_primeira_ocorrencia():
    # "Valor" e "Valor Total" normalizam ambos para revenue → só a primeira fica.
    rename_map = _build_rename_map(["Valor", "Valor Total", "Cliente"])
    targets = list(rename_map.values())
    assert targets.count("revenue") == 1
    assert rename_map.get("Valor") == "revenue"      # primeira vence
    assert "Valor Total" not in rename_map           # colisão ignorada
    assert rename_map.get("Cliente") == "customer_id"
