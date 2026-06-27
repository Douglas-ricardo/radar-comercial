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
    _load_and_normalize,
    _parse_dates_multi_format,
    _sniff_csv,
)


def _write_csv(tmp_path, name, header, rows, encoding, sep):
    path = tmp_path / name
    body = sep.join(header) + "\n" + "\n".join(sep.join(r) for r in rows) + "\n"
    path.write_bytes(body.encode(encoding))
    return str(path)


def _sales_rows(values):
    """Linhas (data, cliente, valor) repetidas o bastante p/ passar o validador."""
    out = []
    for i, v in enumerate(values * 4):
        out.append((f"{(i % 28) + 1:02d}/01/2026", f"Cliente{i % 4}", v))
    return out


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


def test_br_thousands_dot_without_cents():
    """
    FIX #1: milhar BR com ponto e SEM centavos não pode virar fração.
    "1.500" = mil e quinhentos, não 1,5. Era a corrupção silenciosa mais grave.
    """
    assert _clean_money_str("1.500") == 1500.0
    assert _clean_money_str("R$ 1.200") == 1200.0
    assert _clean_money_str("10.000") == 10000.0
    assert _clean_money_str("100.000") == 100000.0
    assert _clean_money_str("1.000.000") == 1000000.0  # múltiplos pontos = milhar
    # ponto com 2 dígitos continua sendo decimal (centavos US): NÃO vira milhar
    assert _clean_money_str("29.90") == 29.90
    assert _clean_money_str("3706.29") == 3706.29
    # 1 ou 4+ dígitos após o ponto = decimal
    assert _clean_money_str("1.5") == 1.5


def test_clean_money_us_grouping_and_sign():
    """Vírgula+ponto: o separador decimal é o último. Sinal e parênteses contábeis."""
    assert _clean_money_str("1,234.56") == 1234.56     # US: vírgula=milhar
    assert _clean_money_str("1.234,56") == 1234.56     # BR: ponto=milhar
    assert _clean_money_str("-1.234,56") == -1234.56
    assert _clean_money_str("(1.234,56)") == -1234.56  # parênteses contábeis


def test_threshold_is_sane():
    assert 0.0 < _DATE_NULL_THRESHOLD < 1.0


# ─── FIX #2 — autodetecção de separador e encoding (robustez ERP-BR) ──────────

def test_sniff_detects_semicolon_and_utf8(tmp_path):
    path = _write_csv(tmp_path, "ponto_virgula.csv",
                      ["data", "cliente", "valor"],
                      [("01/01/2026", "ACME", "1.234,56")],
                      "utf-8", ";")
    assert _sniff_csv(path) == ("utf-8", ";")


def test_sniff_detects_latin1(tmp_path):
    path = _write_csv(tmp_path, "latin.csv",
                      ["data", "cliente", "valor"],
                      [("01/01/2026", "João", "1.234,56")],
                      "latin-1", ";")
    encoding, sep = _sniff_csv(path)
    assert encoding == "cp1252" and sep == ";"


def test_sniff_defaults_to_comma_utf8(tmp_path):
    path = _write_csv(tmp_path, "virgula.csv",
                      ["data", "cliente", "valor"],
                      [("01/01/2026", "ACME", "1500")],
                      "utf-8", ",")
    assert _sniff_csv(path) == ("utf-8", ",")


def test_semicolon_with_comma_decimal(tmp_path):
    """
    O caso que a vírgula-delimitador tornava impossível: ";" como separador deixa a
    vírgula decimal ("1.234,56") conviver no MESMO arquivo, sem virar coluna extra.
    """
    path = _write_csv(tmp_path, "br.csv",
                      ["data", "cliente", "valor"],
                      _sales_rows(["1.500", "2.300", "29,90", "1.234,56"]),
                      "utf-8", ";")
    df = _load_and_normalize(path)
    vals = set(df["revenue"].to_list())
    assert {1500.0, 2300.0, 29.90, 1234.56} <= vals
    assert 1.5 not in vals  # milhar BR não corrompido


def test_latin1_semicolon_preserves_accents_and_values(tmp_path):
    """Arquivo Latin-1 com ";" e acentos: decodifica certo (sem mojibake) e os
    valores BR são parseados corretamente."""
    path = _write_csv(tmp_path, "erp_br.csv",
                      ["data", "cliente", "valor"],
                      _sales_rows(["1.500", "1.234,56"]) + [
                          ("15/02/2026", "João Façanha", "2.300"),
                      ],
                      "latin-1", ";")
    df = _load_and_normalize(path)
    vals = set(df["revenue"].to_list())
    assert {1500.0, 1234.56, 2300.0} <= vals
    # nome original preservado para exibição, com acento intacto (decodificou cp1252)
    displays = " ".join(df["customer_display"].to_list())
    assert "João Façanha" in displays
