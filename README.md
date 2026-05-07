# Radar Comercial

SaaS B2B multi-tenant que transforma histórico de vendas em oportunidades de receita qualificadas para o time comercial.

---

## Sumário

- [Visão geral](#visão-geral)
- [Stack tecnológica](#stack-tecnológica)
- [Arquitetura](#arquitetura)
- [Fluxos principais](#fluxos-principais)
- [Módulos do sistema](#módulos-do-sistema)
  - [Autenticação](#autenticação)
  - [Upload e processamento](#upload-e-processamento)
  - [ETL e análise de dados](#etl-e-análise-de-dados)
  - [Insights e dashboard](#insights-e-dashboard)
  - [Carteira Ativa](#carteira-ativa)
  - [Clientes](#clientes)
  - [Equipe](#equipe)
  - [Integrações e API Keys](#integrações-e-api-keys)
  - [Notificações](#notificações)
  - [Billing e planos](#billing-e-planos)
- [Estrutura do CSV de importação](#estrutura-do-csv-de-importação)
- [Banco de dados — modelos](#banco-de-dados--modelos)
- [API — endpoints](#api--endpoints)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Como rodar localmente](#como-rodar-localmente)
- [Planos e limites](#planos-e-limites)
- [Segurança](#segurança)
- [Roadmap](#roadmap)

---

## Visão geral

O **Radar Comercial** conecta-se ao histórico de vendas de uma empresa (via upload manual de CSV/Excel ou ingestão automática por API/ERP) e entrega:

- **Receita perdida calculada** — quanto dinheiro está parado em clientes que pararam de comprar
- **Oportunidades qualificadas** — lista de clientes inativos ordenados por valor esperado de recuperação
- **Perfis RFV completos** — Recência, Frequência e Valor de cada cliente com alertas de risco
- **Carteira Ativa** — painel comercial para o time registrar ações (a contatar, contatado, ganho, perdido) e medir conversão
- **Notificações automáticas** — digest diário por email e WhatsApp com as melhores oportunidades do dia
- **Ingestão automática** — integração com ERPs (Omie, Bling, Conta Azul) via n8n usando API Key própria por empresa

O diferencial está nos dados: o HubSpot mostra contatos — o Radar mostra **quais clientes reais pararam de comprar, quanto valiam e quando foi a última compra**.

---

## Stack tecnológica

| Camada | Tecnologia |
|---|---|
| **Backend** | Python 3.12 · FastAPI · Celery · Polars |
| **Banco de dados** | PostgreSQL (Neon serverless) · SQLAlchemy |
| **Cache / Filas** | Redis (Upstash) · Celery Beat |
| **Frontend** | Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 |
| **UI Components** | shadcn/ui · Radix UI · Recharts |
| **Billing** | Stripe (Checkout + Webhooks) |
| **Email** | Resend |
| **WhatsApp** | Twilio Business API |
| **Infraestrutura** | Docker · Docker Compose |

---

## Arquitetura

```
comercial/
├── backend/
│   ├── app/
│   │   ├── api/            # Rotas FastAPI (auth, files, insights, team, billing…)
│   │   ├── core/           # Auth JWT, Celery config, rate limiting, segurança
│   │   ├── domain/         # Modelos SQLAlchemy (Company, User, UploadedFile…)
│   │   ├── infrastructure/ # Database session, Redis client
│   │   ├── services/       # PlanService, NotificationService
│   │   └── workers/        # Celery tasks (ETL, notificações diárias)
│   ├── data_engine/
│   │   ├── etl.py          # Pipeline completo: normalização → insights → perfis
│   │   └── validators.py   # Validação de dados antes do processamento
│   └── requirements.txt
└── frontend/
    ├── app/
    │   ├── (auth)/         # login, signup, onboarding, forgot/reset password
    │   └── dashboard/      # Todas as páginas autenticadas
    ├── components/         # Componentes reutilizáveis
    ├── hooks/              # useInsights, useFileUpload, useCustomerDetail
    ├── lib/
    │   ├── api/client.ts   # Cliente HTTP centralizado
    │   └── auth/           # AuthContext com useReducer
    └── types/              # Interfaces TypeScript (fonte única de verdade)
```

### Decisões de arquitetura

- **Sem persistência de transações brutas** — por LGPD e performance, apenas métricas agregadas são armazenadas (`ComputedInsights`, `CustomerProfile`). O arquivo CSV é deletado após o processamento.
- **Multi-tenant por JWT** — todas as queries filtram por `company_id` extraído do token, nunca da URL.
- **ETL assíncrono** — o processamento do arquivo ocorre em worker Celery separado; o frontend faz polling de status a cada 2s.
- **Cache Redis com TTL 15 min** — insights são cacheados por período (1m, 3m, 6m, 12m) e invalidados a cada novo upload.
- **Pool de conexões robusto** — `pool_pre_ping=True` + `pool_recycle=300s` para compatibilidade com Neon serverless.

---

## Fluxos principais

### Upload manual
```
1. Usuário seleciona CSV/XLSX (até 50 MB)
2. Backend valida MIME type + extensão + limite de plano
3. Arquivo salvo em disco temporário
4. Celery task dispatch: process_sales_file(file_id, company_id, path)
5. ETL: normalização → validação → insights por período → perfis de cliente
6. ComputedInsights upsert + CustomerProfile replace no banco
7. Cache Redis invalidado para todos os períodos
8. Arquivo temporário deletado
9. Frontend polling GET /files/{id}/status a cada 2s → redireciona para insights
```

### Ingestão via API Key (ERPs / n8n)
```
1. Sistema externo POST /api/data/ingest com header X-API-Key
2. Backend valida key por SHA-256 hash
3. Registros JSON serializados como CSV temporário
4. Mesmo pipeline Celery do upload manual
```

### Notificações diárias
```
Celery Beat 08:00 BRT → send_daily_notifications
  → Busca preferências habilitadas (NotificationPreference)
  → Carrega ComputedInsights (1m) por empresa
  → Filtra oportunidades acima do valor mínimo configurado
  → Envia email HTML via Resend
  → Envia texto via Twilio WhatsApp (máx 5 oportunidades)
```

---

## Módulos do sistema

### Autenticação

**Páginas:** `/login` · `/signup` · `/onboarding` · `/forgot-password` · `/reset-password`

#### Login (`/login`)
- Campos: **Email** e **Senha**
- Rate limit: 10 tentativas/minuto por IP
- Autenticação via cookie httpOnly `radar_session` (JWT, expira em 7 dias)
- Redirecta para `/dashboard` se já autenticado

#### Cadastro (`/signup`)
- **Nome completo** — nome do usuário administrador
- **Email** — será o login da conta
- **Senha** — mínimo 8 caracteres
- **Nome da empresa** — nome comercial da empresa (pode ser alterado depois)
- Cria a empresa com plano `free` e o usuário com role `admin`
- Após signup, redireciona para onboarding

#### Onboarding (`/onboarding`)
- **Nome da empresa** — pré-preenchido, editável
- **CNPJ** — opcional, para identificação
- **Plano inicial** — escolha entre Gratuito, Profissional (R$497/mês) ou Enterprise (R$1.497/mês)
- Planos pagos redirecionam para Stripe Checkout; gratuito vai direto ao dashboard

#### Recuperação de senha (`/forgot-password`)
- **Email** — recebe link de reset com validade de 30 minutos
- Resposta sempre genérica (anti-enumeração de usuários)

#### Redefinição de senha (`/reset-password?token=…`)
- **Nova senha** — mínimo 8 caracteres, com toggle de visibilidade
- **Confirmar senha** — deve ser igual
- Token validado via Redis (SHA-256); expirado = link inválido
- Após sucesso, redireciona para login em 3s

---

### Upload e processamento

**Página:** `/dashboard/upload`

#### Área de upload
- Aceita **arrastar e soltar** ou clique para selecionar
- Formatos: **CSV** (`.csv`) e **Excel** (`.xlsx`, `.xls`)
- Limite: **50 MB** por arquivo
- Validação de MIME type no servidor (não apenas extensão)

#### Fluxo visual (stepper)
1. **Selecionar** — arquivo escolhido, exibe nome, tamanho e tipo
2. **Confirmar** — preview do arquivo com botão "Iniciar análise"
3. **Processando** — barra de progresso de upload + indicador de processamento
4. **Concluído** — métricas do resultado + botão para ver insights

#### Templates para download
- **Template CSV** — arquivo `.csv` com cabeçalhos e 3 linhas de exemplo
- **Template Excel** — mesmo conteúdo em formato compatível com Excel

#### Estrutura obrigatória do arquivo
Ver seção [Estrutura do CSV de importação](#estrutura-do-csv-de-importação).

---

### ETL e análise de dados

O ETL (`data_engine/etl.py`) é o núcleo do sistema. Processa qualquer CSV/Excel com dados históricos de vendas e produz insights prontos para consumo.

#### Normalização de colunas
O sistema aceita nomes de coluna em português, inglês e variações comuns:

| Coluna canônica | Sinônimos aceitos |
|---|---|
| `date` | `data`, `dt`, `date`, `Data Venda`, `data_pedido`, … |
| `customer_id` | `cliente`, `client`, `customer`, `razao_social`, `nome_cliente`, … |
| `product_id` | `produto`, `product`, `item`, `descricao`, `sku`, … |
| `revenue` | `valor`, `value`, `total`, `receita`, `preco`, `amount`, … |
| `qty` | `quantidade`, `qty`, `quantity`, `qtd`, `units`, … |

#### Formatos de data aceitos
`DD/MM/YYYY` · `YYYY-MM-DD` · `MM/DD/YYYY` · `DD-MM-YYYY` · `YYYY/MM/DD`

O ETL testa todos os formatos e escolhe o que resultar em menos nulos.

#### Validações do arquivo
Executadas antes do processamento (`validators.py`):
- Colunas obrigatórias presentes (`date`, `customer_id`, `revenue`)
- Taxa de nulos em `revenue` < 50% (acima disso: erro fatal, sem retry)
- Linhas com `revenue` nulo ou negativo são descartadas com aviso
- Datas futuras são descartadas com aviso
- Mínimo de 5 linhas válidas (abaixo disso: erro fatal)

#### Períodos analisados
Para cada upload, o ETL gera insights para 4 períodos:

| Código | Período | Uso principal |
|---|---|---|
| `1m` | Últimos 30 dias | Carteira Ativa, notificações |
| `3m` | Últimos 90 dias | Comparativo trimestral |
| `6m` | Últimos 180 dias | Tendências semestrais |
| `12m` | Últimos 365 dias | Visão anual |

#### Detecção de clientes churned
Um cliente é considerado **inativo (churned)** quando sua última compra em todo o histórico ocorreu há mais de **60 dias** em relação à data mais recente do dataset.

Esta detecção usa o histórico completo (não apenas o período analisado), garantindo que períodos curtos (1m) também identifiquem clientes que pararam há mais tempo.

---

### Insights e dashboard

**Páginas:** `/dashboard` (overview) · `/dashboard/insights` (detalhado)

#### KPIs do dashboard principal

| KPI | Descrição |
|---|---|
| **Receita total** | Soma de toda a receita no período selecionado |
| **Receita perdida** | Receita dos clientes churned que ainda compravam no período |
| **Clientes ativos** | Quantidade de clientes únicos com compra no período |
| **Produtos ativos** | Quantidade de produtos/SKUs únicos vendidos no período |
| **Crescimento** | Variação percentual vs. período anterior equivalente |
| **Uploads este mês** | Arquivos processados no mês corrente vs. limite do plano |

#### Filtros de período
Seletor com 4 opções: **Último mês · Últimos 3 meses · Últimos 6 meses · Último ano**

#### Filtros avançados (painel lateral)
- **Valor mínimo esperado (R$)** — exibe só oportunidades acima deste valor
- **Confiança** — filtra por nível: Alta / Média / Baixa / Todas

#### Aba Oportunidades
Lista de clientes inativos com maior potencial de recuperação:

| Campo | Descrição |
|---|---|
| **Cliente** | Nome ou razão social normalizado |
| **Último produto** | Último produto/categoria comprado |
| **Última compra** | Data da última transação registrada |
| **Dias inativo** | Dias desde a última compra até hoje |
| **Valor esperado** | Estimativa de receita recuperável (50% do histórico do cliente) |
| **Confiança** | Alta (>R$1.000) / Média / Baixa — baseado no valor histórico |
| **Tipo** | `declining_customer` (cliente em declínio) |

#### Aba Clientes
Tabela com todos os clientes do período ordenados por receita:

| Campo | Descrição |
|---|---|
| **Nome** | Razão social ou nome normalizado |
| **Receita** | Total gerado no período selecionado |
| **% do total** | Participação na receita total |
| **Tendência** | Crescendo / Estável / Em queda (vs. período anterior) |

Ao clicar em um cliente, abre o perfil detalhado.

#### Aba Gráficos

**Receita × Perdida (área):** evolução mensal da receita total e da receita atribuída a clientes inativos.

**Distribuição de clientes (pizza):** top 6 clientes por receita no período.

**Gap de produtos (barras horizontais):** produtos com maior queda de receita vs. período anterior — onde existe potencial de upsell.

**Sazonalidade (barras agrupadas):** comparativo mês a mês entre receita atual e média histórica, com variação percentual.

#### Exportar PDF
Aciona `window.print()` com layout otimizado para impressão/PDF.

---

### Carteira Ativa

**Página:** `/dashboard/carteira`

Painel comercial para gestão de oportunidades pelo time de vendas. Cada membro registra o andamento de cada cliente inativo sem transformar o sistema em um CRM completo.

#### Aba Oportunidades

**Filtros rápidos de status:**

| Status | Descrição |
|---|---|
| **A contatar** | Oportunidade identificada, ainda não abordada |
| **Contatado** | Cliente foi abordado, aguardando resposta |
| **Ganho** | Venda recuperada com sucesso |
| **Perdido** | Cliente não quis retomar |

Cada card de oportunidade exibe:
- Nome do cliente e dias inativo
- Valor esperado de recuperação
- Status atual com badge colorido
- Botão para registrar/atualizar ação

#### Dialog de ação
Ao clicar em uma oportunidade:
- **Status** — seletor com os 4 estados acima
- **Observações** — campo de texto livre para anotações do comercial (próximo contato, objeções, etc.)

#### Aba Ranking
Tabela de conversão por membro da equipe:

| Campo | Descrição |
|---|---|
| **Vendedor** | Nome do membro (admin ou analyst) |
| **A contatar** | Oportunidades ainda não abordadas |
| **Contatado** | Em andamento |
| **Ganhos** | Recuperações confirmadas |
| **Perdidos** | Oportunidades encerradas sem sucesso |
| **Valor recuperado** | Soma dos `expected_value` das oportunidades marcadas como "ganho" |
| **Taxa de conversão** | `ganhos / (contatados + ganhos + perdidos) × 100%` |

> Admins veem todos os vendedores. Analysts veem apenas seus próprios dados.

---

### Clientes

**Página:** `/dashboard/clientes/[id]`

Perfil completo de um cliente individual com análise RFV (Recência, Frequência, Valor).

#### Métricas RFV

| Métrica | Descrição |
|---|---|
| **Recência** | Dias desde a última compra |
| **Frequência** | Número de compras no histórico |
| **Valor** | Receita total gerada pelo cliente |
| **Segmento** | Classificação: Champion / Loyal / At Risk / Lost / New / Occasional |

#### Seções do perfil

**Alertas** — avisos automáticos como "Cliente inativo há X dias" ou "Queda de receita > 30%".

**Evolução mensal (gráfico de área)** — receita mês a mês do cliente ao longo do histórico.

**Top produtos** — lista dos produtos mais comprados com receita e percentual.

**Histórico de análises** — linha do tempo dos uploads que incluíram este cliente.

---

### Equipe

**Página:** `/dashboard/team`

Gestão de membros da empresa com controle de permissões.

#### Roles (funções)

| Role | Permissões |
|---|---|
| **Admin** | Acesso total: gerencia equipe, plano, integrações, vê todos os dados |
| **Analyst** | Vê insights e carteira, registra ações comerciais, não gerencia equipe/plano |
| **Viewer** | Somente leitura: vê insights e histórico, sem ações |

#### Campos do convite

- **Email** — endereço do novo membro (validado com regex)
- **Função** — Analyst ou Viewer (admin não pode ser convidado)

Ao ser convidado, o membro recebe email com senha temporária (UUID). No primeiro acesso, deve trocar a senha em Configurações.

#### Ações disponíveis
- **Convidar** — envia email e cria usuário com status `pending`
- **Alterar função** — admin pode promover/rebaixar qualquer membro
- **Remover** — remove o acesso (soft delete — desativa o usuário)
- **Reenviar convite** — gera nova senha temporária e reenvia email

---

### Integrações e API Keys

**Página:** `/dashboard/integrations`

Permite que sistemas externos (ERPs, planilhas, n8n) enviem dados de vendas automaticamente sem upload manual.

#### API Keys

Cada empresa pode criar múltiplas chaves para diferentes integrações:

| Campo | Descrição |
|---|---|
| **Nome** | Identificador legível (ex: "Omie Produção", "n8n Vendas") |
| **Prefixo** | Primeiros 16 chars da chave — exibido na listagem após criação |
| **Criado em** | Data de criação |
| **Último uso** | Quando a chave foi usada pela última vez |

> A chave completa (`rc_live_...`) é exibida **apenas no momento da criação**. O banco armazena apenas o hash SHA-256 — nunca o plaintext.

#### Endpoint de ingestão

```
POST /api/data/ingest
Header: X-API-Key: rc_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
Content-Type: application/json

{
  "records": [
    {
      "data": "15/01/2024",
      "cliente": "Empresa ABC Ltda",
      "produto": "Produto Premium",
      "quantidade": 5,
      "valor": 2500.00
    }
  ]
}
```

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `data` | string | Sim | Data da venda (DD/MM/YYYY ou YYYY-MM-DD) |
| `cliente` | string | Sim | Nome ou ID do cliente |
| `produto` | string | Sim | Nome ou SKU do produto |
| `quantidade` | number | Sim | Quantidade vendida |
| `valor` | number | Sim | Valor total da venda (sem R$) |

Retorna `{ file_id, records_queued }` — o processamento ocorre de forma assíncrona pelo mesmo pipeline do upload manual.

#### Rate limit
60 requisições/minuto por IP na rota de ingestão.

#### Exemplo com n8n
```
Node: HTTP Request
Method: POST
URL: https://seuapp.com/api/data/ingest
Headers:
  X-API-Key: rc_live_sua_chave_aqui
  Content-Type: application/json
Body: {{ $json }}
```

---

### Notificações

**Página:** `/dashboard/settings` → aba Notificações

#### Preferências por usuário

| Campo | Tipo | Descrição |
|---|---|---|
| **Ativar notificações** | Toggle | Liga/desliga todas as notificações deste usuário |
| **Email** | Toggle | Recebe digest diário por email |
| **WhatsApp** | Toggle | Recebe digest diário por WhatsApp |
| **Número WhatsApp** | Texto | Formato internacional: `+5511999999999` |
| **Horário de envio** | Número (0-23) | Hora do dia para receber (padrão: 8h) — ajuste de referência, envio fixo às 08:00 BRT |
| **Valor mínimo** | Número | Só notifica oportunidades acima deste valor em R$ |

#### Agendamento
O Celery Beat dispara `send_daily_notifications` diariamente às **08:00 BRT (11:00 UTC)**.

#### Botão "Enviar teste"
Envia imediatamente um exemplo de email e/ou WhatsApp com as oportunidades atuais para validar a configuração.

---

### Billing e planos

**Página:** `/dashboard/billing`

#### Plano atual
Exibe o plano contratado com barra de progresso de uploads utilizados no mês.

#### Comparativo de planos

| Recurso | Gratuito | Profissional | Enterprise |
|---|---|---|---|
| **Preço** | R$ 0/mês | R$ 497/mês | R$ 1.497/mês |
| **Uploads/mês** | 5 | 50 | Ilimitado |
| **Usuários** | 1 | Até 10 | Ilimitado |
| **Análise** | Básica | Avançada | Avançada |
| **WhatsApp** | Não | Sim | Sim |
| **API de ingestão** | Não | Sim | Sim |
| **Conectores ERP** | Não | Não | Via n8n |
| **SLA dedicado** | Não | Não | Sim |
| **Onboarding assistido** | Não | Não | Sim |
| **SSO** | Não | Não | Sim |

#### Upgrade
Ao clicar em "Fazer upgrade", o usuário é redirecionado para o **Stripe Checkout** (modo subscription). Após o pagamento, o plano é atualizado via webhook `checkout.session.completed`.

#### Sincronização automática
Ao retornar do Stripe com `?upgraded=1`, o frontend chama `/api/billing/debug-sync-plan` que busca a assinatura ativa diretamente na API do Stripe e atualiza o plano sem depender do webhook (útil em desenvolvimento local).

---

## Estrutura do CSV de importação

O arquivo deve conter **exatamente estas 5 colunas** (os nomes podem variar — veja a lista de sinônimos na seção ETL):

| Coluna | Tipo | Obrigatório | Exemplos válidos |
|---|---|---|---|
| `data` | Data | Sim | `01/01/2024`, `2024-01-01`, `01-01-2024` |
| `cliente` | Texto | Sim | `Empresa ABC Ltda`, `João da Silva`, `12.345.678/0001-99` |
| `produto` | Texto | Sim | `Produto Premium`, `SKU-001`, `Consultoria Mensal` |
| `quantidade` | Número | Sim | `5`, `1`, `12.5` |
| `valor` | Número | Sim | `2500.00`, `890`, `1.500,00` |

**Exemplo:**
```csv
data,cliente,produto,quantidade,valor
01/01/2024,Empresa ABC Ltda,Produto Premium,5,2500.00
15/01/2024,Comércio XYZ,Serviço Mensal,1,890.00
20/02/2024,Indústria Beta,Produto Standard,12,360.00
```

**Dicas para melhor precisão:**
- Envie histórico longo — ideal 12 a 24 meses
- Não deixe valores nulos nas colunas obrigatórias
- Remova linhas de totais ou formatações visuais do Excel
- Linhas com `valor` negativo ou zero são descartadas automaticamente
- Datas futuras são descartadas automaticamente

---

## Banco de dados — modelos

### Company (companies)

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | UUID PK | Identificador único da empresa |
| `name` | String | Nome comercial da empresa |
| `cnpj` | String nullable | CNPJ (opcional) |
| `plan` | Enum | `free` / `pro` / `enterprise` |
| `uploads_used` | Integer | Uploads realizados no mês corrente |
| `uploads_limit` | Integer | Limite de uploads do plano atual |
| `stripe_customer_id` | String nullable | ID do customer no Stripe |
| `stripe_subscription_id` | String nullable | ID da subscription no Stripe |
| `plan_updated_at` | DateTime nullable | Quando o plano foi alterado pela última vez |
| `created_at` | DateTime | Data de criação |

### User (users)

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | UUID PK | Identificador único do usuário |
| `company_id` | UUID FK | Empresa à qual pertence |
| `name` | String | Nome completo |
| `email` | String unique | Email de login |
| `hashed_password` | String | Senha hasheada com bcrypt |
| `role` | Enum | `admin` / `analyst` / `viewer` |
| `status` | Enum | `active` / `pending` (aguardando primeiro acesso) |
| `created_at` | DateTime | Data de criação |

### UploadedFile (uploaded_files)

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | UUID PK | Identificador único do upload |
| `company_id` | UUID FK | Empresa que fez o upload |
| `filename` | String | Nome original do arquivo |
| `status` | Enum | `pending` / `processing` / `completed` / `failed` |
| `error_message` | Text nullable | Mensagem de erro em caso de falha |
| `created_at` | DateTime | Data do upload |

### AnalysisResult (analysis_results)

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | UUID PK | Identificador único |
| `file_id` | UUID FK | Arquivo que gerou este resultado |
| `company_id` | UUID FK | Empresa |
| `total_revenue` | Float | Receita total do arquivo |
| `lost_revenue` | Float | Receita de clientes inativos |
| `opportunities_count` | Integer | Quantidade de oportunidades identificadas |
| `active_customers` | Integer | Clientes únicos no período |
| `analyzed_products` | Integer | Produtos únicos no período |
| `created_at` | DateTime | Data da análise |

### ComputedInsights (computed_insights)

Insights pré-computados por empresa e período. Um único registro por `(company_id, date_range)` — substituído a cada novo upload (upsert).

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | UUID PK | Identificador único |
| `company_id` | UUID FK | Empresa |
| `date_range` | String | `1m` / `3m` / `6m` / `12m` |
| `summary` | JSON | KPIs: `totalRevenue`, `lostRevenue`, `lostRate`, `revenueGrowth`, `uniqueCustomers`, `uniqueProducts` |
| `opportunities` | JSON | Lista de oportunidades com `customerHash`, `customer`, `lastPurchase`, `daysInactive`, `expectedValue`, `confidence` |
| `charts` | JSON | Dados de gráficos: `timeSeries`, `customerDistribution`, `productGaps`, `seasonality` |
| `computed_at` | DateTime | Quando foi calculado |

### CustomerProfile (customer_profiles)

Perfil RFV completo por cliente. Substituído integralmente a cada novo upload.

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | UUID PK | Identificador único |
| `company_id` | UUID FK | Empresa |
| `customer_hash` | String | MD5 do nome normalizado (identificador estável) |
| `customer_name` | String | Nome original do cliente |
| `total_revenue` | Float | Receita total no histórico |
| `percentage` | Float | % da receita total da empresa |
| `last_purchase_date` | Date | Data da última compra |
| `recency_days` | Integer | Dias desde a última compra |
| `trend` | Enum | `up` / `stable` / `down` |
| `segment` | String | Segmento RFV: Champion, Loyal, At Risk, Lost, New, Occasional |
| `rfv` | JSON | Scores: `recency`, `frequency`, `monetary` (1-5 cada) |
| `top_products` | JSON | Lista de top produtos com nome, receita e % |
| `monthly_revenue` | JSON | Receita por mês `[{ month, value }]` |
| `alerts` | JSON | Alertas ativos `[{ type, message, severity }]` |

### NotificationPreference (notification_preferences)

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | UUID PK | Identificador único |
| `user_id` | UUID FK unique | Um registro por usuário |
| `enabled` | Boolean | Notificações ativas? |
| `email_enabled` | Boolean | Enviar por email? |
| `whatsapp_enabled` | Boolean | Enviar por WhatsApp? |
| `whatsapp_phone` | String nullable | Número no formato `+5511999999999` |
| `send_hour` | Integer | Hora de referência (0-23) |
| `min_opportunity_value` | Float | Valor mínimo para notificar (padrão: 0) |

### ApiKey (api_keys)

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | UUID PK | Identificador único |
| `company_id` | UUID FK | Empresa proprietária |
| `name` | String | Nome descritivo da integração |
| `key_hash` | String | SHA-256 da chave (banco nunca armazena plaintext) |
| `prefix` | String | Primeiros 16 chars para identificação na UI |
| `is_active` | Boolean | Chave ativa? (false = revogada) |
| `last_used_at` | DateTime nullable | Último uso |
| `created_at` | DateTime | Data de criação |

### OpportunityAction (opportunity_actions)

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | UUID PK | Identificador único |
| `company_id` | UUID FK | Empresa |
| `user_id` | UUID FK | Vendedor responsável pela ação |
| `opportunity_id` | String | `customerHash` da oportunidade |
| `customer_name` | String | Nome do cliente (snapshot) |
| `expected_value` | Float | Valor esperado no momento da ação |
| `status` | Enum | `to_contact` / `contacted` / `won` / `lost` |
| `notes` | Text nullable | Observações do vendedor |
| `updated_at` | DateTime | Última atualização |

Constraint única: `(company_id, user_id, opportunity_id)` — um registro de ação por vendedor por oportunidade.

---

## API — endpoints

### Auth
| Método | Rota | Descrição |
|---|---|---|
| POST | `/api/auth/signup` | Cadastro de empresa + admin |
| POST | `/api/auth/login` | Login (seta cookie httpOnly) |
| POST | `/api/auth/logout` | Logout (limpa cookie) |
| GET | `/api/auth/me` | Dados do usuário e empresa autenticados |
| POST | `/api/auth/change-password` | Alterar senha (usuário autenticado) |
| POST | `/api/auth/forgot-password` | Solicitar link de reset |
| POST | `/api/auth/reset-password` | Redefinir senha com token |

### Files
| Método | Rota | Descrição |
|---|---|---|
| POST | `/api/files/upload` | Upload de CSV/XLSX |
| GET | `/api/files/{file_id}/status` | Status do processamento |
| GET | `/api/files/` | Lista de uploads da empresa |
| DELETE | `/api/files/{file_id}` | Remover registro de upload |

### Insights
| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/insights/{company_id}` | Insights do período (`?date_range=6m`) |

### Customers
| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/customers/{company_id}/{customer_id}` | Perfil detalhado de um cliente |

### Team
| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/team/{company_id}` | Listar membros |
| POST | `/api/team/{company_id}/invite` | Convidar novo membro |
| PATCH | `/api/team/members/{member_id}/role` | Alterar função |
| DELETE | `/api/team/members/{member_id}` | Remover membro |
| POST | `/api/team/members/{member_id}/resend-invite` | Reenviar convite |

### Account
| Método | Rota | Descrição |
|---|---|---|
| PATCH | `/api/users/{user_id}` | Atualizar dados do usuário |
| PATCH | `/api/company/{company_id}` | Atualizar dados da empresa |

### Billing
| Método | Rota | Descrição |
|---|---|---|
| POST | `/api/billing/create-checkout-session` | Criar sessão Stripe Checkout |
| POST | `/api/billing/webhook` | Webhook Stripe (checkout.session.completed) |
| POST | `/api/billing/debug-sync-plan` | Sincronizar plano via API Stripe (apenas com DEBUG_WEBHOOK=true) |

### Integrations
| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/integrations/keys` | Listar API Keys |
| POST | `/api/integrations/keys` | Criar nova API Key |
| DELETE | `/api/integrations/keys/{key_id}` | Revogar API Key |
| POST | `/api/data/ingest` | Ingestão de dados via API Key |

### Notifications
| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/notifications/preferences` | Buscar preferências |
| PATCH | `/api/notifications/preferences` | Atualizar preferências |
| POST | `/api/notifications/test-send` | Enviar notificação de teste |

### Carteira
| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/carteira/{company_id}` | Listar oportunidades com ações (`?status=`) |
| POST | `/api/carteira/{company_id}/actions` | Registrar/atualizar ação comercial |
| GET | `/api/carteira/{company_id}/ranking` | Ranking de conversão por vendedor |

---

## Variáveis de ambiente

### Backend (`backend/.env`)

```env
# ── Obrigatórias ──────────────────────────────────────────────────────────────
SECRET_KEY=                    # openssl rand -hex 32
DATABASE_URL=postgresql://...  # PostgreSQL (Neon, Supabase, etc.)
REDIS_URL=redis://...          # Redis (Upstash ou local)
CELERY_BROKER_URL=redis://...  # Mesmo Redis
ALLOWED_ORIGINS=http://localhost:3000
COOKIE_SECURE=false            # true em produção (HTTPS)

# ── Stripe ────────────────────────────────────────────────────────────────────
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PRICE_PRO=price_...
STRIPE_PRICE_ENTERPRISE=price_...
STRIPE_WEBHOOK_SECRET=whsec_...
FRONTEND_URL=http://localhost:3000

# ── Notificações (Resend + Twilio) ───────────────────────────────────────────
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=Radar Comercial <noreply@seudominio.com>
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886

# ── Configurações adicionais ──────────────────────────────────────────────────
APP_BASE_URL=http://localhost:3000
TEMP_DIR=                      # Deixar vazio para usar backend/temp/ (padrão)
DEBUG_WEBHOOK=false            # true apenas em desenvolvimento local
```

### Frontend (`frontend/.env.local`)

```env
NEXT_PUBLIC_API_URL=http://localhost:8000/api
```

---

## Como rodar localmente

### Pré-requisitos
- Python 3.12+
- Node.js 20+
- Redis (local ou Upstash)
- PostgreSQL (local ou Neon)

### Backend

```bash
cd backend

# Criar e ativar virtualenv
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Instalar dependências
pip install -r requirements.txt

# Configurar variáveis de ambiente
cp .env.example .env
# Editar .env com suas credenciais

# Criar tabelas no banco
python -c "from app.infrastructure.database import Base, engine; Base.metadata.create_all(engine)"

# Rodar API
uvicorn app.main:app --reload

# Em outro terminal: worker Celery
celery -A app.core.celery_app.celery_app worker --loglevel=info

# Em outro terminal: scheduler de notificações
celery -A app.core.celery_app.celery_app beat --loglevel=info
```

### Frontend

```bash
cd frontend

# Instalar dependências
npm install

# Configurar variável de ambiente
echo "NEXT_PUBLIC_API_URL=http://localhost:8000/api" > .env.local

# Rodar servidor de desenvolvimento
npm run dev
```

Acesse: [http://localhost:3000](http://localhost:3000)

### Docker (opcional)

```bash
cd backend
docker-compose up
```

Sobe: API (porta 8000) · Worker Celery · Beat Celery · Redis · PostgreSQL

### Webhook Stripe em desenvolvimento

```bash
# Instalar Stripe CLI
brew install stripe/stripe-cli/stripe

# Autenticar
stripe login

# Encaminhar eventos para o backend local
stripe listen --forward-to localhost:8000/api/billing/webhook
```

---

## Planos e limites

| Plano | Uploads/mês | Usuários | Uploads limit DB |
|---|---|---|---|
| `free` | 5 | 1 | 5 |
| `pro` | 50 | 10 | 50 |
| `enterprise` | Ilimitado | Ilimitado | 999.999 |

Os limites são gerenciados exclusivamente pelo `PlanService` (`app/services/plan_service.py`). O campo `uploads_used` é incrementado atomicamente com `UPDATE ... WHERE uploads_used < uploads_limit` — evitando race conditions em uploads simultâneos.

---

## Segurança

| Medida | Detalhe |
|---|---|
| **Auth** | JWT em cookie httpOnly — sem token no localStorage |
| **Rate limiting** | Login: 10/min · Signup: 5/min · Forgot password: 3/min · Ingestão: 60/min |
| **Multi-tenancy** | Todo acesso filtra por `company_id` do JWT — nunca da URL |
| **API Keys** | SHA-256 armazenado — plaintext nunca persiste no banco |
| **Reset de senha** | Token SHA-256 em Redis com TTL 30 min — invalidado após uso |
| **CORS** | `ALLOWED_ORIGINS` via variável de ambiente |
| **HTTPS** | `COOKIE_SECURE=true` em produção via variável de ambiente |
| **Privacidade** | Transações brutas não persistidas — apenas métricas agregadas (LGPD) |
| **Uploads** | Validação de MIME type + extensão + tamanho (50 MB) no servidor |
| **Webhook Stripe** | Verificação de assinatura HMAC obrigatória + idempotência Redis 24h |

---

## Roadmap

### Etapa 3 — IA para mensagem personalizada
- `POST /api/opportunities/{id}/generate-message`
- Usa Claude API com contexto do perfil RFV do cliente
- Gera texto pt-BR pronto para enviar no WhatsApp
- Botão "Gerar mensagem" em cada card de oportunidade

### Etapa 5 — Conectores de ERP
- Templates de workflow n8n para: Omie, Conta Azul, Bling, Google Sheets
- Painel de status de última sincronização por conector
- Suporte a múltiplos webhooks por empresa

### Melhorias planejadas
- Migração de cobrança por upload → por usuário ativo/mês
- Armazenamento de arquivos temporários em S3 (suporte a múltiplas instâncias)
- SSO para plano Enterprise
- Relatórios exportáveis em Excel com dados completos
