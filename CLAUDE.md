# CLAUDE.md

Guia de contexto para Claude Code. Leia antes de tocar em qualquer arquivo.

---

## Visão geral do produto

**Radar Comercial** — SaaS B2B multi-tenant que processa histórico de vendas (CSV, API ou ERP) de empresas e gera:
- Insights de receita perdida e clientes inativos
- Oportunidades de recuperação com valor esperado calculado
- Notificações diárias automáticas para o time comercial (email/WhatsApp)
- Mensagens personalizadas geradas por IA para cada oportunidade

**Público-alvo:** gestores comerciais e vendedores de PMEs brasileiras.
**Diferencial:** oportunidades já qualificadas com histórico real — o HubSpot não tem isso nativamente.
**Monetização:** por usuário ativo/mês (migração planejada de modelo por upload para modelo por usuário).

---

## Comandos de desenvolvimento

### Backend (rodar a partir de `backend/`)

```bash
uvicorn app.main:app --reload                                          # API
celery -A app.core.celery_app.celery_app worker --loglevel=info        # Worker
celery -A app.core.celery_app.celery_app beat --loglevel=info          # Scheduler (notificações diárias)
celery -A app.core.celery_app.celery_app worker --loglevel=info --concurrency=4  # Produção
```

### Frontend (rodar a partir de `frontend/`)

```bash
npm run dev      # servidor de desenvolvimento
npm run build    # build de produção
npm run lint     # ESLint
```

### n8n (quando integrado)

```bash
docker run -it --rm --name n8n -p 5678:5678 n8nio/n8n   # local
# Painel: http://localhost:5678
```

---

## Arquitetura atual

### Backend — FastAPI + Celery + Polars

```
backend/
  app/
    api/
      auth.py           → login, signup, logout, change-password (rate limited: 10/min login, 5/min signup)
      files.py          → upload (50 MB limit, stream chunks), status, list, delete
      insights.py       → GET /insights/{company_id}?date_range= (cache Redis 15 min)
      customers.py      → GET /customers/{company_id}/{customer_id}
      team.py           → list, invite, remove, updateRole, resend-invite
      account.py        → PATCH /users/{id}, PATCH /company/{id}
      billing.py        → Stripe checkout + webhook
      notifications.py  → [PLANEJADO] preferências + test-send
      integrations.py   → [PLANEJADO] API Keys + POST /data/ingest
    core/
      auth.py           → get_current_user_and_company (lê cookie radar_session)
      rate_limit.py     → limiter slowapi global
      celery_app.py     → Celery config + beat_schedule (notificações 08:00 BRT)
      security.py       → JWT, bcrypt, create_access_token
    domain/
      models.py         → Company, User, UploadedFile, AnalysisResult,
                          ComputedInsights, CustomerProfile,
                          NotificationPreference [PLANEJADO],
                          ApiKey [PLANEJADO]
    infrastructure/
      database.py       → SQLAlchemy session (SessionLocal, get_db_session)
      redis_client.py   → redis_client singleton
    services/
      plan_service.py   → PlanService: limites de upload/usuário por plano
      notification_service.py → [PLANEJADO] Resend + Twilio
    workers/
      tasks.py          → process_sales_file (Celery task principal)
      notification_tasks.py → [PLANEJADO] send_daily_notifications
  data_engine/
    etl.py              → ETL completo: normalização, insights por date_range,
                          build_customer_profiles, geração de oportunidades.
                          Usa logger (não print). Suporta datas em BR/ISO/US.
    validators.py       → placeholder vazio
  ml/                   → placeholder vazio (usar Claude API para IA, não ML local)
```

### Frontend — Next.js 16 + TypeScript + shadcn/ui

```
frontend/
  app/(auth)/           → login, signup, onboarding (sem sidebar)
  app/dashboard/
    page.tsx            → overview com KPIs
    upload/             → upload de CSV com polling de status
    insights/           → gráficos + lista de oportunidades
    clientes/[id]/      → perfil RFV do cliente
    history/            → histórico de análises
    team/               → gestão de equipe (invite, roles, remove)
    settings/           → perfil, empresa, plano, senha, [PLANEJADO: notificações]
    integrations/       → [PLANEJADO] gestão de API Keys
    carteira/           → [PLANEJADO] Carteira Ativa (oportunidades com status comercial)
  lib/api/client.ts     → cliente HTTP centralizado (credentials: 'include')
  lib/auth/auth-context.tsx → estado global via useReducer + AuthProvider
  hooks/                → use-file-upload, use-insights, use-customer-detail
  components/ui/        → shadcn/ui — NÃO editar diretamente
  types/index.ts        → interfaces TypeScript únicas (fonte de verdade)
```

---

## Fluxos de dados

### Fluxo 1 — Upload manual (CSV/XLSX)
```
POST /api/files/upload
  → valida MIME + extensão + tamanho (50 MB) + limite de plano
  → stream em chunks → salva em temp/{id}_{filename}
  → incremento atômico de uploads_used (UPDATE com WHERE clause)
  → dispara Celery: process_sales_file(file_id, company_id, path)
  → Worker: ETL → ComputedInsights (upsert) + CustomerProfile (replace) + AnalysisResult
  → invalida cache Redis: insights:{company_id}:{1m,3m,6m,12m}
  → deleta arquivo temp (só após sucesso ou esgotamento de retries)
  → Frontend polling: GET /files/{id}/status a cada 2s (máx 60 tentativas)
```

### Fluxo 2 — Ingestão via API Key [PLANEJADO]
```
POST /api/data/ingest
  Header: X-API-Key: rc_live_xxxxxxxx
  Body: [{ data, cliente, produto, quantidade, valor }, ...]
  → autentica key por SHA-256 hash no banco
  → serializa como CSV temp → dispara mesmo Celery task
  → mesmo pipeline do fluxo 1 a partir daqui
```

### Fluxo 3 — Notificações diárias [PLANEJADO]
```
Celery Beat: 08:00 BRT (11:00 UTC) → send_daily_notifications
  → busca NotificationPreference where enabled=True
  → para cada user (role admin ou analyst):
      → lê ComputedInsights (date_range="1m") da empresa
      → filtra por min_opportunity_value
      → [IA] gera mensagem personalizada por oportunidade (Claude API)
      → envia email (Resend) se email_enabled
      → envia WhatsApp (Twilio) se whatsapp_enabled + phone configurado
```

### Fluxo 4 — n8n como camada de integração [PLANEJADO]
```
ERP do cliente (Omie, Bling, Conta Azul, etc.)
  → n8n node/webhook detecta nova venda
  → chama POST /api/data/ingest com API Key da empresa
  → mesmo pipeline do fluxo 2

n8n também pode:
  → receber webhook "processamento concluído" e disparar notificação imediata
  → substituir parte do Celery Beat para notificações mais flexíveis
```

---

## Modelos do banco (SQLAlchemy)

| Model | Tabela | Propósito |
|---|---|---|
| `Company` | companies | Empresa, plano, Stripe IDs |
| `User` | users | Usuário, role (admin/analyst/viewer), status (active/pending) |
| `UploadedFile` | uploaded_files | Registro de cada upload; status: pending/processing/completed/failed |
| `AnalysisResult` | analysis_results | Métricas agregadas por arquivo (total_revenue, lost_revenue, opp_count) |
| `ComputedInsights` | computed_insights | Insights pré-computados por (company_id, date_range). Upsert a cada upload. JSON: summary, opportunities, charts |
| `CustomerProfile` | customer_profiles | Perfil RFV por cliente. Replace completo a cada upload. JSON: rfv, top_products, monthly_revenue, alerts |
| `NotificationPreference` | notification_preferences | **[PLANEJADO]** prefs por usuário: enabled, email_enabled, whatsapp_phone, send_hour, min_opportunity_value |
| `ApiKey` | api_keys | **[PLANEJADO]** chaves de ingestão por empresa; armazena hash SHA-256, nunca o plaintext |

**Decisão de arquitetura crítica:** não persistimos transações brutas. Apenas métricas agregadas (`ComputedInsights`, `CustomerProfile`). Isso é intencional por LGPD/privacidade e performance.

---

## Autenticação

### Usuários (JWT cookie)
- Cookie httpOnly `radar_session` (7 dias)
- Payload: `{ sub: user_id, company_id, role }`
- Toda rota protegida usa `Depends(get_current_user_and_company)` em `app/core/auth.py`
- Frontend: `credentials: 'include'` em todos os requests
- `COOKIE_SECURE` vem de env var (False local, True em produção HTTPS)

### API Keys de ingestão [PLANEJADO]
- Header `X-API-Key: rc_live_xxxxxxxx`
- Prefixo `rc_live_` + `secrets.token_urlsafe(32)`
- Banco armazena SHA-256 do key — nunca o plaintext
- Rota `/api/data/ingest` usa dependência separada `Depends(get_company_from_api_key)`
- Usuário gerencia suas keys em `/dashboard/integrations`

---

## Multi-tenancy e planos

Todas as queries filtram por `company_id` extraído do JWT. **Nunca confiar no `company_id` da URL sem validar contra o token.**

| Plano | Uploads | Usuários | Preço futuro |
|---|---|---|---|
| free | 5 | 1 | Gratuito |
| pro | 50 | 10 | R$497/mês (migrar para por usuário) |
| enterprise | ∞ | ∞ | R$1.497/mês |

`PlanService` (`app/services/plan_service.py`) é a fonte única para limites.
Upgrade: Stripe webhook `checkout.session.completed` com idempotência Redis (TTL 86400s).

---

## ETL — data_engine/etl.py

- `CANONICAL_COLUMNS`: dicionário de normalização de colunas (PT/EN → canônico). Editar só aqui para novos sinônimos.
- `_DATE_FORMATS`: suporta `%d/%m/%Y`, `%Y-%m-%d`, `%m/%d/%Y`, `%d-%m-%Y`, `%Y/%m/%d` — tenta o que parsear menos nulls.
- `process_sales_pipeline(path, company_id)`: entrypoint do worker. Retorna dict com `insights_by_range`, `customer_profiles`, `total_revenue`, `lost_revenue`, `opportunities_count`.
- `generate_dynamic_insights(df, date_range)`: computa KPIs, oportunidades (clientes churned), time series, product gaps, seasonality.
- `build_customer_profiles(df)`: perfis RFV completos para todos os clientes.
- Usa `logger` (não `print`).

### "Data Warehouse" local
Parquet em `temp/master_data_{company_id}.parquet`. Redis lock `etl_lock:{company_id}` protege escrita concorrente.
> **Limitação:** disco local. Para multi-instância → migrar para S3/blob storage.

---

## Integrações externas

| Serviço | Uso | Status |
|---|---|---|
| **PostgreSQL (Neon)** | Banco principal | Ativo |
| **Redis (Upstash)** | Cache insights (15 min) + Celery broker + locks ETL | Ativo |
| **Stripe** | Checkout + webhooks de upgrade de plano | Ativo |
| **Resend** | Email transacional (notificações, convites) | **Planejado** |
| **Twilio** | WhatsApp Business API | **Planejado** |
| **Claude API** | Geração de mensagem personalizada por oportunidade | **Planejado** |
| **n8n** | Orquestração de workflows + conectores de ERP (Omie, Bling, etc.) | **Planejado** |

---

## Variáveis de ambiente

### Obrigatórias (já em uso)
```
SECRET_KEY                # openssl rand -hex 32
DATABASE_URL              # PostgreSQL
REDIS_URL                 # Upstash ou local
CELERY_BROKER_URL         # mesmo Redis
STRIPE_SECRET_KEY
STRIPE_PRICE_PRO
STRIPE_PRICE_ENTERPRISE
STRIPE_WEBHOOK_SECRET
ALLOWED_ORIGINS           # ex: http://localhost:3000 (vírgula para múltiplos)
COOKIE_SECURE             # false local, true em produção
```

### Planejadas (adicionar quando implementar)
```
RESEND_API_KEY            # re_xxxxxxxxxxxx
RESEND_FROM_EMAIL         # Radar Comercial <noreply@seudominio.com>
TWILIO_ACCOUNT_SID        # ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN
TWILIO_WHATSAPP_FROM      # whatsapp:+14155238886 (sandbox) ou número aprovado
ANTHROPIC_API_KEY         # para geração de mensagem com Claude
APP_BASE_URL              # https://seuapp.com (link nos emails)
N8N_WEBHOOK_SECRET        # para validar chamadas do n8n
```

Frontend: `NEXT_PUBLIC_API_URL` em `frontend/.env.local`.

---

## Padrões obrigatórios

- **Resposta de API:** sempre `{ "success": true, "data": ... }` ou `{ "success": false, "error": "..." }`. O cliente TS espera `ApiResponse<T>`.
- **Logs:** `logger.info("dominio.acao", extra={...})` — nunca `print()`.
- **Operações bloqueantes** (ETL, envio de emails em massa) → Celery, nunca inline no request.
- **Multi-tenancy:** toda query filtra por `company_id` do JWT, não da URL.
- **Sem any no TypeScript:** usar tipos explícitos. `TeamMember`, `DisplayMember`, etc. em `types/index.ts`.
- **API routes novas:** registrar em `app/main.py` + adicionar ao cliente em `lib/api/client.ts` + tipo em `types/index.ts`.
- **Cache Redis:** insights = 900s. Invalidar ao processar novo arquivo (`_invalidate_insights_cache`).

---

## Roadmap de features (por etapa)

### Etapa 1 — Ingestão automática via API Key
- `ApiKey` model em `models.py`
- `app/api/integrations.py`: CRUD de keys + `POST /api/data/ingest`
- Auth separada: `Depends(get_company_from_api_key)` lê header `X-API-Key`
- Frontend: página `/dashboard/integrations` — criar/revogar keys + docs de uso
- n8n: configurar node HTTP para chamar o endpoint com a key

### Etapa 2 — Notificações diárias (email + WhatsApp)
- `NotificationPreference` model
- `app/services/notification_service.py`: Resend + Twilio
- `app/workers/notification_tasks.py`: `send_daily_notifications` Celery task
- Celery Beat: `beat_schedule` 08:00 BRT em `celery_app.py`
- `app/api/notifications.py`: GET/PATCH preferências + POST test-send
- Frontend: aba "Notificações" em `/dashboard/settings`

### Etapa 3 — IA para mensagem personalizada
- `POST /api/opportunities/{id}/generate-message`
- Usa `anthropic` SDK com contexto do `CustomerProfile` (recency, products, value)
- Retorna texto pt-BR pronto para copiar e enviar no WhatsApp
- Frontend: botão "Gerar mensagem" em cada card de oportunidade

### Etapa 4 — Carteira Ativa (gestão comercial sem virar CRM)
- Modelo `OpportunityAction`: status (to_contact / contacted / won / lost) por oportunidade + user
- Painel `/dashboard/carteira`: oportunidades filtradas pelo que o comercial precisa agir
- Dashboard de gestor: ranking de conversão por vendedor
- Métrica de ROI: valor_ganho / valor_identificado → aparece no topo do dashboard

### Etapa 5 — Conectores de ERP via n8n
- Documentar como configurar workflow n8n → `POST /api/data/ingest`
- Criar templates de workflow n8n para: Omie, Conta Azul, Bling, Google Sheets
- Painel `/dashboard/integrations`: status de última sincronização por conector

---

## Segurança — estado atual

| Item | Status |
|---|---|
| Rate limiting em /auth/login (10/min) e /auth/signup (5/min) | ✅ Implementado (`slowapi`) |
| Cookie `COOKIE_SECURE` via env var | ✅ Implementado |
| CORS `ALLOWED_ORIGINS` via env var | ✅ Implementado |
| `.env` com credenciais reais no repositório | ⚠️ Revogar chaves Stripe/Neon/Upstash |
| Criar `.env.example` com placeholders | ⚠️ Pendente |
| `secure=True` em produção | ✅ Via `COOKIE_SECURE=true` |
| Sem rate limit nas demais rotas | ⚠️ Monitorar |
