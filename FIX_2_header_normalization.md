# FIX 2 — ETL rejeita cabeçalhos reais de PME (normalização de header frágil)

Cole numa sessão do Claude Code DEPOIS que o FIX 1 estiver aplicado e o upload
funcionando. Corrija só este bug nesta sessão.

## Causa raiz (confirmada por execução do ETL)
`data_engine/etl.py` casa colunas com `c.lower().strip()` contra `CANONICAL_COLUMNS`,
em DOIS lugares com lógica duplicada:
  - `_load_and_normalize` (~linha 249), caminho CSV (inline)
  - `normalize_columns` (~linha 58), caminho Excel
`lower().strip()` não troca espaço por underscore nem remove sufixos `(R$)`, então
headers comuns de planilha PME são rejeitados na entrada:
  - "Data Venda"  → "data venda" (espaço) ≠ "data_venda" (underscore) → falha
  - "Valor (R$)"  → "valor (r$)" ≠ "valor" → falha
  - "value"/"quantity" → não existem como sinônimos no dict → falha
Resultado medido: dos 5 CSVs de teste, só 1_limpo e 3_fresco passam. 2_ptbr, 4_stale
e 5_sujo (o "CSV que a PME real manda") reprovam por coluna ausente.

## Tarefa
1. Adicione a função de normalização de header (use `import re` no topo do módulo):
   ```python
   def _canon_key(col: str) -> str:
       """Normaliza nome de coluna p/ casar com CANONICAL_COLUMNS de forma robusta."""
       c = col.strip().lower()
       c = re.sub(r"\(.*?\)", "", c)           # remove "(r$)", "(un)"
       c = re.sub(r"[\s\-]+", "_", c.strip())  # "data venda" -> "data_venda"
       c = re.sub(r"_+", "_", c).strip("_")    # colapsa underscores
       return c
   ```

2. Adicione os sinônimos em inglês que faltam ao `CANONICAL_COLUMNS`:
   ```python
   "quantity": "qty",
   "value": "revenue",
   ```

3. Substitua AMBOS os matchers para usar `_canon_key(c)` no lugar de `c.lower().strip()`.
   - `normalize_columns`: trocar a comprehension.
   - bloco CSV em `_load_and_normalize`: construir rename_map e cols_to_read com
     `key = _canon_key(c)`, usando o nome ORIGINAL `c` em cols_to_read (preserva o
     column-pushdown) e `CANONICAL_COLUMNS[key]` no rename.

4. **Guard de colisão**: se duas colunas normalizarem para a mesma canônica
   (ex.: "Valor" e "Valor Total" → revenue), o polars quebra no rename. Detecte
   duplicatas no rename_map e mantenha só a primeira ocorrência, logando um warning
   sobre a coluna ignorada. (Não há esse caso nos CSVs de teste, mas há em CSV real.)

5. Testes de regressão (faltavam — por isso o bug existia):
   - subir header com espaço/maiúscula/parênteses ("Data Venda", "Valor (R$)") e
     afirmar que normaliza para date/revenue.
   - subir header inglês ("date,customer,product,quantity,value") e afirmar que
     todas as 5 mapeiam.

## Verificação — medir antes/depois
```
.venv/bin/pytest tests/ -q
python e2e/generate_test_csvs.py e2e/test_csvs     # se ainda não gerou
RADAR_API=http://localhost:8000/api python e2e/run_e2e.py
```
ANTES do fix: 2/5 uploads processam (1_limpo, 3_fresco).
DEPOIS do fix: os 5 devem processar. Em especial:
  - 4_stale → deve processar E mostrar dataFreshness "até DD/MM" (dado defasado),
    confirmando ponta a ponta o ramo stale que não pôde ser verificado antes.
  - 5_sujo → deve processar; valide na resposta de insights que as linhas de lixo
    (TOTAL GERAL, branco, valor 0, negativo, data futura) foram descartadas e que
    o totalRevenue NÃO inclui os 123.456,78 da linha "TOTAL GERAL".

Reporte a tabela de 5 cenários antes/depois e o veredito das validações semânticas do 5_sujo.
