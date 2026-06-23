# Conectores de ERP via n8n → `POST /api/data/ingest`

O Radar já aceita ingestão automática por **API Key** (`POST /api/data/ingest`).
O n8n é a cola: ele lê as vendas do ERP do cliente periodicamente e envia pro
Radar — sem o cliente subir CSV na mão. Isto é o que destrava o "dado fresco"
que a notificação diária precisa.

```
ERP (Omie / Bling / Conta Azul) ──> n8n (schedule + map) ──> POST /api/data/ingest
```

## Contrato do endpoint (igual pra todos os ERPs)

```
POST {APP_BASE_URL}/api/data/ingest
Header: X-API-Key: rc_live_xxxxxxxx        (gere em /dashboard/integrations)
Content-Type: application/json
Body: [
  { "data": "2026-06-01", "cliente": "Padaria do Centro", "produto": "Farinha",
    "quantidade": 10, "valor": 350.00, "telefone": "11999990000", "email": "x@y.com" }
]
```
`telefone`/`email` são opcionais (habilitam o disparo ao cliente final).
Datas aceitas: `YYYY-MM-DD`, `DD/MM/YYYY` (o ETL normaliza).

## Fluxo n8n (genérico — 4 nós)

1. **Schedule Trigger** — ex.: a cada 6h (ou diário às 03:00).
2. **HTTP Request (ERP)** — busca as vendas do período (ver auth por ERP abaixo).
3. **Code / Set** — mapeia o JSON do ERP pro contrato acima (renomeia campos).
4. **HTTP Request (Radar)** — `POST {APP_BASE_URL}/api/data/ingest`, header
   `X-API-Key`, body = array mapeado. Recomendado: enviar em lotes (≤ 5 000 linhas).

> Template importável: [`n8n-generic-ingest.json`](./n8n-generic-ingest.json)
> (importe no n8n, troque a credencial/URL do ERP e a API Key do Radar).

## Auth + endpoint por ERP

### Omie
- Auth: `app_key` + `app_secret` no corpo de cada chamada (sem OAuth).
- Endpoint de vendas: `POST https://app.omie.com.br/api/v1/produtos/pedido/` → `ListarPedidos`
  (ou `vendas/...` conforme o módulo contratado).
- Mapeie: `det[].produto.descricao → produto`, `det[].produto.quantidade → quantidade`,
  `det[].produto.valor_total → valor`, `cabecalho.data_previsao/etc → data`,
  `cliente (via ListarClientes) → cliente`.

### Bling (API v3)
- Auth: **OAuth2** (Authorization Code). No n8n use a credencial "OAuth2 API".
- Endpoint: `GET https://api.bling.com.br/Api/v3/pedidos/vendas?dataInicial=...&dataFinal=...`
- Mapeie: `itens[].descricao → produto`, `itens[].quantidade → quantidade`,
  `itens[].valor → valor`, `data → data`, `contato.nome → cliente`,
  `contato.telefone/email → telefone/email`.

### Conta Azul
- Auth: **OAuth2**.
- Endpoint: `GET https://api.contaazul.com/v1/sales?...` (vendas).
- Mapeie: `items[].description → produto`, `items[].quantity → quantidade`,
  `items[].value → valor`, `emission → data`, `customer.name → cliente`.

> ⚠️ Os caminhos exatos de campo variam por versão da API e plano contratado do
> ERP. Confirme no painel de cada ERP; o nó **Code** é onde você ajusta o `map`.

## Boas práticas
- **Idempotência:** reenviar o mesmo período é seguro — o ETL é "replace" por empresa.
- **Janela:** busque um período móvel (ex.: últimos 90 dias) pra capturar correções.
- **Rate:** `/data/ingest` é limitado a 60/min por IP; agrupe em poucos POSTs grandes.
- **Segredos:** a API Key do Radar e as credenciais do ERP ficam só no n8n (Credentials), nunca no workflow exportado.
