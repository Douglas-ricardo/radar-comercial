"""
Regressão para FIX 3 — corrupção/perda silenciosa de dados no ETL.

Dois bugs da mesma classe ("o arquivo passa mas os números mentem"):
  3A — datas em formatos mistos descartavam metade das linhas em silêncio.
  3B — valores em formato US ("3706.29") eram inflados 100x ("370629").

A ausência destes testes escondeu ambos os bugs. Eles medem comportamento real,
não documentação.
"""
import polars as pl
import pytest

from data_engine.etl import (
    _DATE_NULL_THRESHOLD,
    _cast_types,
    _clean_money_str,
    _parse_dates_multi_format,
)


def test_mixed_date_formats_keep_all_rows():
    """Datas mistas (ISO + BR) no mesmo arquivo: TODAS as linhas sobrevivem."""
    df = pl.DataFrame({
        "date": [
            "2026-01-15", "15/01/2026", "2026-02-20", "20/02/2026",
            "2026-03-10", "10/03/2026",
        ]
    })
    out = _parse_dates_multi_format(df)
    assert out["date"].null_count() == 0, "formatos mistos não deveriam virar null"
    assert out.height == 6


def test_date_loss_threshold_raises():
    """Coluna com >30% de datas-lixo aborta com ValueError em vez de descartar calado."""
    # 6 datas válidas + 4 lixos = 40% de perda (> 30%)
    df = pl.DataFrame({
        "date": [
            "2026-01-15", "2026-01-16", "2026-01-17",
            "2026-01-18", "2026-01-19", "2026-01-20",
            "lixo", "n/a", "???", "data inválida",
        ]
    })
    with pytest.raises(ValueError):
        _parse_dates_multi_format(df)


def test_date_loss_below_threshold_warns_not_raises():
    """Perda pequena (<30%) é tolerada: descarta a linha-lixo e segue."""
    df = pl.DataFrame({
        "date": [
            "2026-01-15", "2026-01-16", "2026-01-17",
            "2026-01-18", "lixo",
        ]
    })  # 1/5 = 20% < 30%
    out = _parse_dates_multi_format(df)
    assert out["date"].null_count() == 1
    assert out.height == 5  # ainda não fez drop_nulls aqui


def test_mixed_money_formats_no_100x_inflation():
    """
    O teste que pega o bug 3B: "3706.29" (US) NÃO pode virar 370629.
    revenue misto BR + US no mesmo arquivo.
    """
    df = pl.DataFrame({
        "revenue": ["R$ 1.234,56", "3706.29", "890,00", "1500"],
    })
    out = _cast_types(df)
    got = out["revenue"].to_list()
    assert got == [1234.56, 3706.29, 890.0, 1500.0], got
    # explicitamente: o valor US não foi inflado 100x
    assert got[1] == 3706.29 and got[1] != 370629.0


def test_br_thousands_separator():
    """Valor BR com milhar: "1.234.567,89" → 1234567.89."""
    assert _clean_money_str("1.234.567,89") == 1234567.89
    assert _clean_money_str("R$ 1.234.567,89") == 1234567.89


def test_clean_money_edge_cases():
    assert _clean_money_str(None) is None
    assert _clean_money_str("") is None
    assert _clean_money_str("   ") is None
    assert _clean_money_str("R$ 159,68") == 159.68
    assert _clean_money_str("3706.29") == 3706.29   # US decimal preservado
    assert _clean_money_str("1500") == 1500.0
    assert _clean_money_str("lixo") is None


def test_threshold_is_sane():
    assert 0.0 < _DATE_NULL_THRESHOLD < 1.0
