"""
Regressão da auditoria de leitura de CSV (2026-07-04) — 4 bugs reais:

  A — cabeçalho ACENTUADO ("Razão Social", "Emissão", "Preço") não casava com
      CANONICAL_COLUMNS (sem acento) → arquivo rejeitado ou coluna ignorada em
      silêncio. Agravante: chaves com espaço no dict ("data da venda") eram
      inalcançáveis porque _canon_key converte espaço em underscore.
  B — data com componente de HORA ("2026-02-10 10:30:00", "10/02/2026 14:22" —
      export típico de ERP/Excel) falhava 100% dos formatos → arquivo abortado.
  C — UMA linha malformada (nº de campos ≠ cabeçalho) estourava
      polars.ComputeError, que não é ValueError → o worker fazia 3 retries
      inúteis e o usuário via erro técnico em inglês.
  D — espaços internos duplicados não eram colapsados na deduplicação:
      "joão  da  silva" e "João da Silva" viravam DOIS clientes.
"""
import polars as pl
import pytest

from data_engine.etl import (
    _build_rename_map,
    _canon_key,
    _load_and_normalize,
    _parse_dates_multi_format,
    normalize_customer_name,
)


def _write(tmp_path, name, content, encoding="utf-8"):
    path = tmp_path / name
    path.write_bytes(content.encode(encoding))
    return str(path)


# ── A: cabeçalhos acentuados ─────────────────────────────────────────────────

def test_canon_key_remove_acentos():
    assert _canon_key("Razão Social") == "razao_social"
    assert _canon_key("Emissão") == "emissao"
    assert _canon_key("Descrição") == "descricao"
    assert _canon_key("Preço") == "preco"
    assert _canon_key("Serviço") == "servico"


def test_rename_map_aceita_headers_acentuados_de_erp():
    rename_map = _build_rename_map(["Emissão", "Razão Social", "Descrição", "Preço"])
    assert rename_map["Emissão"] == "date"
    assert rename_map["Razão Social"] == "customer_id"
    assert rename_map["Descrição"] == "product_id"
    assert rename_map["Preço"] == "revenue"


def test_chave_com_espaco_do_dict_e_alcancavel():
    # "data da venda" está declarada com espaços em CANONICAL_COLUMNS; o header
    # real "Data da Venda" vira "data_da_venda" e PRECISA casar mesmo assim.
    rename_map = _build_rename_map(["Data da Venda", "Cliente", "Valor"])
    assert rename_map["Data da Venda"] == "date"


def test_pipeline_completo_header_acentuado(tmp_path):
    content = "Data da Venda;Razão Social;Valor Total (R$)\n" + "\n".join(
        f"1{i}/02/2026;Empresa {i};1.000,00" for i in range(8)
    )
    p = _write(tmp_path, "acentos.csv", content)
    df = _load_and_normalize(p)
    assert abs(df["revenue"].sum() - 8000.0) < 0.01


# ── B: data com hora ─────────────────────────────────────────────────────────

def test_datetime_iso_com_hora_parseia():
    df = pl.DataFrame({"date": ["2026-02-10 10:30:00", "2026-02-11 23:59:59"]})
    out = _parse_dates_multi_format(df)
    assert out["date"].null_count() == 0
    assert str(out["date"][0]) == "2026-02-10"


def test_datetime_br_com_hora_parseia():
    df = pl.DataFrame({"date": ["10/02/2026 14:22", "11/02/2026 08:00:01"]})
    out = _parse_dates_multi_format(df)
    assert out["date"].null_count() == 0
    assert str(out["date"][0]) == "2026-02-10"


def test_datetime_iso_t_e_timezone_parseia():
    df = pl.DataFrame({"date": ["2026-02-10T10:30:00Z", "2026-02-11T10:30:00.123+03:00"]})
    out = _parse_dates_multi_format(df)
    assert out["date"].null_count() == 0


def test_pipeline_completo_data_com_hora(tmp_path):
    content = "data,cliente,valor\n" + "\n".join(
        f"2026-02-1{i} 10:30:00,C{i},100.00" for i in range(8)
    )
    p = _write(tmp_path, "com_hora.csv", content)
    df = _load_and_normalize(p)
    assert df.height == 8


# ── C: linha malformada não derruba o arquivo nem vaza erro do polars ────────

def test_linha_com_campos_a_mais_nao_derruba(tmp_path):
    content = "data;cliente;valor\n"
    content += "\n".join(f"1{i}/02/2026;C{i};100,00" for i in range(8))
    content += "\n10/02/2026;C9;100,00;EXTRA;EXTRA\n11/02/2026;C10;100,00"
    p = _write(tmp_path, "ragged.csv", content)
    df = _load_and_normalize(p)  # não pode estourar ComputeError
    assert df.height >= 8


def test_erro_de_leitura_vira_valueerror_ptbr(monkeypatch, tmp_path):
    # Força o polars a falhar nas duas tentativas → deve virar ValueError (sem
    # retry no worker), nunca vazar PolarsError cru.
    import data_engine.etl as etl

    def boom(*args, **kwargs):
        raise pl.exceptions.ComputeError("found more fields than defined in 'Schema'")

    monkeypatch.setattr(etl, "_collect_csv", boom)
    p = _write(tmp_path, "broken.csv", "data;cliente;valor\n10/02/2026;A;1\n")
    with pytest.raises(ValueError, match="CSV"):
        _load_and_normalize(p)


# ── D: colapso de espaços internos na deduplicação ───────────────────────────

def test_normalize_customer_name_colapsa_espacos():
    assert normalize_customer_name("joão  da  silva") == "joao da silva"
    assert normalize_customer_name("  João \t da\nSilva ") == "joao da silva"
    assert normalize_customer_name("João da Silva") == "joao da silva"


# ── E: encoding — fronteira de 64 KiB e UTF-16 ───────────────────────────────

def test_multibyte_cortado_na_fronteira_do_sniffer_nao_vira_mojibake(tmp_path):
    """Arquivo UTF-8 >64KiB com caractere multibyte cortado exatamente no byte
    65536 da amostra: o sniffer NÃO pode cair para cp1252 (mojibake silencioso)."""
    header = "data;cliente;valor\n"
    linha = "10/02/2026;Cliente Comum;100,00\n"
    buf = bytearray(header.encode())
    while len(buf) + len(linha.encode()) < 65516:
        buf += linha.encode()
    name_pad = 65535 - len(buf) - len("10/02/2026;".encode())
    buf += ("10/02/2026;" + "x" * name_pad + "ção;100,00\n").encode("utf-8")
    assert buf[65535] == 0xC3  # 1º byte do 'ç' exatamente no corte da amostra
    buf += linha.encode() * 10
    p = tmp_path / "boundary.csv"
    p.write_bytes(bytes(buf))

    df = _load_and_normalize(str(p))
    joined = " ".join(df["customer_display"].to_list())
    assert "Ã" not in joined, "sniffer caiu para cp1252 em arquivo UTF-8 válido"
    assert "ção" in joined


def test_utf16_excel_unicode_processa(tmp_path):
    """Excel 'Texto Unicode' salva UTF-16 (BOM + tabs). Antes: rejeitado com
    'colunas obrigatórias ausentes' (enganoso — as colunas existem)."""
    content = "data\tcliente\tvalor\n" + "\n".join(
        f"1{i}/02/2026\tClí {i}\t100,00" for i in range(8)
    )
    p = tmp_path / "unicode.csv"
    p.write_bytes(content.encode("utf-16"))

    df = _load_and_normalize(str(p))
    assert df.height == 8
    assert abs(df["revenue"].sum() - 800.0) < 0.01


def test_pipeline_agrupa_variacoes_de_espaco(tmp_path):
    content = "data;cliente;valor\n" + "\n".join([
        "10/02/2026;João da Silva;100,00",
        "11/02/2026;JOAO DA SILVA;100,00",
        "12/02/2026;joão  da  silva;100,00",
        "13/02/2026;Outro;100,00",
        "14/02/2026;Outro2;100,00",
        "15/02/2026;Outro3;100,00",
    ])
    p = _write(tmp_path, "espacos.csv", content)
    df = _load_and_normalize(p)
    assert df["customer_id"].n_unique() == 4
