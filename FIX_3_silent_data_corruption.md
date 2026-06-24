# FIX 3 — Corrupção/perda silenciosa de dados no ETL (datas mistas + valores mistos)

Cole numa sessão do Claude Code DEPOIS dos FIX 1 e 2. Esta sessão corrige DOIS bugs
da mesma classe — "o arquivo passa mas os números mentem" — que são mais perigosos
que os anteriores porque não geram erro nem crash: o upload fica verde e os números
saem errados. Para um produto que vende confiança nos números, isto é churn garantido.

NÃO confie na documentação. Meça antes/depois com contagem e magnitude reais.

---

## BUG 3A — Datas em formatos mistos descartam metade das linhas (silencioso)

### Causa (data_engine/etl.py:121-148, _parse_dates_multi_format)
A função tenta cada formato e fica com o "vencedor único" (menos nulls) para a coluna
INTEIRA. Num arquivo com datas mistas (parte ISO, parte dd/mm/yyyy — comum quando a PME
consolida fontes), as linhas do formato minoritário viram null e morrem no drop_nulls.
Medido: 5_sujo perde ~29 de ~61 linhas legítimas, sem aviso.

### Correção
Substituir a escolha de vencedor por COALESCE por linha: cada linha pega o primeiro
formato de _DATE_FORMATS que a parsear. Preservar o aviso de ambiguidade BR×US que já
existe. Adicionar trava: se a perda exceder limiar, FALHA com erro claro.

```python
_DATE_NULL_THRESHOLD = 0.30   # acima disso: aborta em vez de descartar calado
                              # (decisão de produto — ajuste ao seu apetite)

def _parse_dates_multi_format(df: pl.DataFrame) -> pl.DataFrame:
    """Coalesce de TODOS os formatos por linha: permite formatos mistos no mesmo
    arquivo. Ordem de _DATE_FORMATS define precedência em datas ambíguas (BR antes
    de US). Aborta se a perda de linhas exceder _DATE_NULL_THRESHOLD."""
    total = df.height
    if total == 0:
        return df

    # nulls por formato — só para o AVISO de ambiguidade (não escolhe vencedor)
    nulls_by_fmt = {
        fmt: df["date"].str.to_date(fmt, strict=False).null_count()
        for fmt in _DATE_FORMATS
    }

    # coalesce: cada linha recupera o 1º formato que a parsear
    attempts = [pl.col("date").str.to_date(fmt, strict=False) for fmt in _DATE_FORMATS]
    df = df.with_columns(pl.coalesce(attempts).alias("date"))

    nulls = df["date"].null_count()
    loss = nulls / total
    if loss > _DATE_NULL_THRESHOLD:
        raise ValueError(
            f"{nulls} de {total} datas ({loss:.0%}) não reconhecidas. "
            f"Verifique a coluna de data. Formatos aceitos: {', '.join(_DATE_FORMATS)}."
        )
    if nulls > 0:
        logger.warning("etl.dates.dropped",
                       extra={"dropped": nulls, "total": total, "rate": round(loss, 3)})

    # aviso de ambiguidade BR×US preservado
    if nulls_by_fmt.get("%d/%m/%Y") == nulls_by_fmt.get("%m/%d/%Y") and nulls < total:
        logger.warning("etl.dates.ambiguous_format",
                       extra={"chosen": "%d/%m/%Y", "note": "BR e US empataram; assumindo dd/mm"})
    return df
```

---

## BUG 3B — Valores em formato misto são corrompidos 100x (silencioso, PIOR)

### Causa (data_engine/etl.py:149-157, _cast_types)
A limpeza de revenue assume formato BR fixo:
```python
.str.replace_all(r"R\$", "").str.replace_all(r"\.", "")   # remove TODisplay os pontos
.str.replace_all(",", ".")
```
Em valor BR "1.234,56" → "1234.56" (correto). Mas em valor com ponto decimal
"3706.29" (formato US/export de sistema) → remove o ponto → "370629" → vira 370.629,00.
Um valor de 3,7 mil vira 370 mil. Inflado 100x, SEM null, SEM erro. O 5_sujo mistura
os dois formatos → o totalRevenue contém valores inflados e ainda "passa" nas checagens.

### Correção
Detectar o formato por valor antes de limpar. Regra robusta para BR vs US/internacional:
- Se tem vírgula: é decimal BR. O último separador é a vírgula decimal; pontos são milhar.
  "1.234,56" → remove pontos, vírgula→ponto → "1234.56". "1.234.567,89" idem.
- Se NÃO tem vírgula mas tem ponto: o ponto é decimal (US) — NÃO remover.
  "3706.29" → "3706.29". "370" → "370".
- Sem separador: inteiro puro.

Implementação sugerida (por linha, via when/then do polars ou UDF):
```python
def _clean_money_str(s: str) -> float | None:
    if s is None:
        return None
    t = re.sub(r"[R$\s]", "", str(s)).strip()
    if t == "":
        return None
    if "," in t:
        # decimal BR: pontos são milhar, vírgula é decimal
        t = t.replace(".", "").replace(",", ".")
    # senão: ponto (se houver) já é decimal — não mexer
    try:
        return float(t)
    except ValueError:
        return None
```
Aplique via map_elements (UDF) na coluna revenue quando for string, OU replique a
lógica com pl.when(pl.col("revenue").str.contains(",")).then(...).otherwise(...).
A UDF é mais legível e o volume (CSV de PME) não justifica otimização vetorial agora.

---

## Testes de regressão (a AUSÊNCIA deles escondeu ambos os bugs)

`backend/tests/test_etl_mixed_formats.py` (novo):
1. **Datas mistas**: DataFrame com metade ISO ("2026-01-15") e metade BR ("15/01/2026").
   Afirmar que TODAS as linhas sobrevivem (0 nulls após parse), não a metade.
2. **Datas: trava de perda**: coluna com >30% de datas-lixo → afirmar que levanta ValueError.
3. **Valores mistos**: revenue com "R$ 1.234,56", "3706.29", "890,00", "1500".
   Afirmar resultado [1234.56, 3706.29, 890.0, 1500.0] — em especial que "3706.29"
   NÃO virou 370629. Este é o teste que pega o bug 3B.
4. **Valor BR com milhar**: "1.234.567,89" → 1234567.89.

## Verificação — medir magnitude, não só "passou"
```
.venv/bin/pytest tests/ -q          # 85 + 4 novos = 89 esperado
python e2e/generate_test_csvs.py e2e/test_csvs
RADAR_API=http://localhost:8000/api python e2e/run_e2e.py
```
Métricas de sucesso (rode o ETL direto no 5_sujo e compare):
- **Linhas válidas**: antes ~32 → depois ~56 (61 do arquivo menos 5 lixos propositais).
- **totalRevenue**: deve CAIR em relação ao valor anterior (R$ 59.149,92), porque os
  valores que estavam inflados 100x agora entram na escala certa. Confirme que nenhum
  valor individual de revenue está absurdamente alto (ex.: > 100x a mediana).
- Liste min/max/mediana de revenue do 5_sujo antes e depois do fix.

Reporte: contagem de linhas antes/depois, totalRevenue antes/depois, e os 4 testes verdes.
NÃO conserte mais nada nesta sessão. Só estes dois bugs de dados.
