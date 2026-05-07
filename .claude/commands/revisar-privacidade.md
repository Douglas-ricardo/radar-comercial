Você está no projeto **Radar Comercial**. Faça uma auditoria de privacidade nas mudanças recentes.

## Contexto da decisão

Por decisão explícita do produto, **nenhum dado bruto de transação de cliente é persistido no servidor**. Clientes enviaram planilhas com dados sensíveis (compras individuais, valores, produtos) e têm expectativa de que esses dados não ficam armazenados.

## O que é PERMITIDO armazenar

| Modelo | O que guarda |
|--------|-------------|
| `ComputedInsights` | KPIs e gráficos pré-computados por período (totais, %, tendências) |
| `CustomerProfile` | Métricas por cliente: receita total, score RFV, top 5 produtos, série mensal |
| `AnalysisResult` | Totais do arquivo (total_revenue, lost_revenue, opportunities_count) |
| `UploadedFile` | Metadados do arquivo (nome, status) — sem conteúdo |

## O que é PROIBIDO

- Salvar linhas individuais de venda (data + cliente + produto + qty + valor)
- Manter arquivo CSV/XLSX no disco após o processamento (`temp/` é só temporário)
- Criar novos campos JSON em modelos que guardem array de transações
- Escrever parquet ou qualquer formato de arquivo de dados no disco de forma permanente

## O que verificar no código

1. **Novos modelos** em `backend/app/domain/models.py` — algum novo campo guarda array de transações?
2. **ETL** (`backend/data_engine/etl.py`) — alguma escrita de arquivo que não seja em `finally` com delete?
3. **Worker** (`backend/app/workers/tasks.py`) — `_delete_raw_file()` está sendo chamado no `finally`?
4. **Novas rotas** — algum endpoint retorna lista de transações individuais?
5. **Frontend** — alguma nova tela exibe tabela de compras individuais por cliente?

## Como auditar

Leia os arquivos modificados recentemente (use `git diff` se disponível, ou leia os arquivos-chave) e reporte:
- ✅ OK / ⚠️ Atenção / ❌ Violação para cada ponto acima
- Se encontrar violação, proponha a correção

---

$ARGUMENTS
