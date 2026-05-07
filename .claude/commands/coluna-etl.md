Você está no projeto **Radar Comercial**. Sua tarefa é adicionar suporte a um novo nome de coluna no tradutor do ETL.

## Arquivo alvo
`backend/data_engine/etl.py` — dicionário `CANONICAL_COLUMNS` no topo do arquivo.

## Como funciona
O ETL aceita planilhas com colunas em português ou inglês e as traduz para nomes canônicos internos:

| Canônico | O que representa |
|----------|-----------------|
| `date` | Data da venda |
| `customer_id` | Nome/ID do cliente |
| `product_id` | Nome/ID do produto |
| `qty` | Quantidade |
| `revenue` | Valor monetário da venda |

## Regras para adicionar
1. A **chave** deve ser em **minúsculas** (o ETL aplica `.lower().strip()` antes de buscar)
2. O **valor** deve ser um dos 5 canônicos acima — nada mais
3. Testar com o CSV de exemplo adequado em `backend/temp/` ou nos arquivos `0*.csv` na raiz do projeto

## Arquivos CSV de teste disponíveis
- `01_cenario_ideal.csv` — colunas padrão em português
- `02_tradutor_colunas.csv` — variações de nomes de colunas
- `03_teste_deduplicacao.csv` — dados duplicados
- `04_teste_nomes_sujos.csv` — nomes com acentos e caixa mista
- `05_teste_fail_fast_sem_valor.csv` — deve falhar na validação

## Após adicionar
Confirmar que `normalize_columns()` no mesmo arquivo ainda funciona corretamente — ela itera sobre `df.columns` e usa o dicionário.

---

Novo sinônimo a adicionar: $ARGUMENTS
