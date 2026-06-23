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
**Monetização:** cobrança **per-seat no Stripe** — `quantity` = nº de usuários da empresa.

> **NOTA DE PRECISÃO (sincronizado com o código em 2026-06-22):** Todas as fases do roadmap original estão concluídas. Adicionalmente: CI/CD (GitHub Actions), observabilidade (Sentry + logging central), ML preditivo treinável (GradientBoosting com fallback heurístico), Alembic (migrações versionadas), rate limit via Redis (multi-instância), reprocessamento opt-in, testes E2E (Playwright), TypeScript strict. Redesign visual completo: landing + auth + app logado na base "Modern Tech Bright" (índigo claro + Bricolage). Ver histórico de commits.

### Status real das features (código, não intenção)

| Feature | Estado | Evidência |
|---|---|---|
| Auth + forgot/reset password | ✅ funcional | `app/api/auth.py` |
| Upload / insights / customers / team / account / billing | ✅ funcional | respectivos `app/api/*.py` |
| Paginação em `/api/files/` (`limit`/`offset`, `pagination.total`) | ✅ implementado | `app/api/files.py` |
| Reprocessamento opt-in (`POST /api/files/{id}/reprocess`) | ✅ implementado | `app/api/files.py`, `RETAIN_SOURCE_FILES` |
| Validators do ETL | ✅ funcional | `data_engine/validators.py` |
| Ingestão por API Key (`POST /data/ingest`) | ✅ funcional | `app/api/integrations.py` |
| Notificações ao vendedor (Resend + WhatsApp Cloud API Meta + Celery Beat) | ✅ funcional | `notification_service.py`, `notification_tasks.py` |
| Carteira Ativa | ✅ funcional | `app/api/carteira.py` |
| IA / mensagem personalizada (Claude Haiku) | ✅ implementado | `app/api/opportunities.py` |
| Disparo automático ao cliente final (WhatsApp Evolution + Email + IA + opt-out + sync Carteira) | ✅ implementado | `app/api/outreach.py`, `outreach_service.py`, `evolution_client.py`, `outreach_tasks.py` |
| Loop fechado de receita recuperada | ✅ implementado | `OutreachAttribution`, `outreach_service.resolve_attributions` |
| Captura de respostas WhatsApp + opt-out automático ("PARE") | ✅ implementado | `POST /outreach/webhook/evolution`, `core/webhook_sign.py` |
| Churn preditivo com ML treinável | ✅ implementado | `ml/inference.py` (modelo se existir) + `ml/churn.py` (fallback heurístico), `ml/train.py` |
| Cadência multi-toque | ✅ implementado | `CadenceEnrollment`, `outreach_service.process_due_enrollments` |
| LGPD: opt-out + unsubscribe + erase de PII | ✅ implementado | `ContactOptOut`, `core/unsubscribe.py` |
| Conector Google Sheets (pull agendado) | ✅ implementado | `app/workers/sync_tasks.py` |
| Conectores ERP via n8n | ✅ documentado | `docs/integrations/n8n-erp.md` + template `n8n-generic-ingest.json` |
| Object storage R2/Spaces | ✅ implementado, degradação p/ disco | `app/infrastructure/storage.py` |
| CI/CD (GitHub Actions) | ✅ implementado | `.github/workflows/ci.yml` (backend+frontend+e2e) |
| Observabilidade: Sentry + logging central | ✅ implementado | `app/core/observability.py` (gated por `SENTRY_DSN`) |
| Rate limit via Redis (multi-instância + X-Forwarded-For) | ✅ implementado | `app/core/rate_limit.py` |
| Migrações versionadas (Alembic) | ✅ scaffolding pronto | `backend/alembic/` (baseline a rodar na primeira vez) |
| Frontend: testes E2E (Playwright) | ✅ implementado | `frontend/e2e/smoke.spec.ts` |
| Frontend: TypeScript strict | ✅ ligado | `frontend/tsconfig.json` |
| Redesign visual "Modern Tech Bright" | ✅ implementado | Landing + auth (`.landing-2026`/`.auth-2026`) + app (tokens globais em `globals.css`) |

---

## Comandos de desenvolvimento

### Backend (a partir de `backend/`)

```bash
uvicorn app.main:app --reload                                          # API
celery -A app.core.celery_app.celery_app worker --loglevel=info --pool=threads --concurrency=4  # Worker
celery -A app.core.celery_app.celery_app beat --loglevel=info          # Scheduler
```
> **macOS:** use `--pool=threads` (prefork + polars/pyarrow → SIGSEGV no fork).

### ML — treinar modelo de churn (a partir de `backend/`)

```bash
# dados sintéticos (valida pipeline ponta a ponta):
python -m ml.train --synthetic

# dados reais (CSV: recency_days,avg_interval_days,frequency,label):
python -m ml.train --data labels.csv

# Salvo em ml/model.joblib; inferência usa automaticamente na próxima task.
```

### Alembic — migrações (a partir de `backend/`)

```bash
# Primeira vez: gera baseline com o estado atual dos models
alembic revision --autogenerate -m "baseline"
alembic upgrade head

# Fluxo normal: após mudar models.py
alembic revision --autogenerate -m "descricao"
alembic upgrade head
```

### Evolution API (WhatsApp ao cliente final)

```bash
EVOLUTION_API_KEY=<sua_key> docker compose -f docker-compose.evolution.yml up -d
# API: http://localhost:8080 | Manager: http://localhost:8080/manager
```

### Stripe (webhooks locais)

```bash
stripe listen --forward-to http://localhost:8000/api/billing/webhook
```

### Frontend (a partir de `frontend/`)

```bash
npm run dev          # dev
npm run build        # prod
npm run lint         # ESLint
npm run test:e2e     # Playwright smoke (requer dev rodando ou sobe automaticamente)
```

### n8n (local)

```bash
docker run -it --rm --name n8n -p 5678:5678 n8nio/n8n
# Importe docs/integrations/n8n-generic-ingest.json e configure as credenciais
```

---

## Arquitetura atual

### Backend — FastAPI + Celery + Polars

```
backend/
  app/
    api/
      auth.py           → login, signup, logout, change-password (rate limited)
      files.py          → upload (50 MB, stream), status, list (paginado), delete, reprocess
      insights.py       → GET /insights/{company_id}?date_range= (cache Redis 15 min)
      customers.py      → GET /customers/{company_id}/{customer_id}
      team.py           → list, invite, remove, updateRole, resend-invite
      account.py        → PATCH /users/{id}, PATCH /company/{id}
      billing.py        → Stripe checkout + webhook
      carteira.py       → Carteira Ativa: list + upsert-action + ranking
      notifications.py  → preferências + test-send
      integrations.py   → API Keys + POST /data/ingest
      opportunities.py  → POST /{id}/generate-message (IA Claude Haiku)
      outreach.py       → config + QR + contatos + preview + send-now + webhook Evolution
    core/
      auth.py           → get_current_user_and_company + validate_api_key
      rate_limit.py     → Limiter slowapi: storage Redis + X-Forwarded-For (multi-instância)
      celery_app.py     → config + beat_schedule
      security.py       → JWT, bcrypt, força de senha
      observability.py  → configure_logging() + init_sentry() — gated, degrada sem SENTRY_DSN
      clock.py          → utcnow() (testável)
      unsubscribe.py    → tokens de unsubscribe LGPD
      webhook_sign.py   → HMAC para webhook Evolution
    domain/
      models.py         → todos os models SQLAlchemy (ver tabela abaixo)
    infrastructure/
      database.py       → engine + SessionLocal + _ensure_columns (migração leve, convive com Alembic)
      redis_client.py   → singleton Redis
      storage.py        → R2/Spaces + source_exists() + degradação p/ disco
    services/
      plan_service.py   → limites por plano
      notification_service.py → Resend + WhatsApp Cloud API Meta
      evolution_client.py → cliente Evolution API
      outreach_service.py → dispatcher + IA + sync Carteira + atribuição
      pdf_report.py     → relatório PDF (fpdf2)
    workers/
      tasks.py          → process_sales_file + lock ETL + RETAIN_SOURCE_FILES
      notification_tasks.py → send_daily_notifications
      sync_tasks.py     → Google Sheets pull agendado
      outreach_tasks.py → send_daily_outreach + run_company_outreach_task
  data_engine/
    etl.py              → ETL 100% em memória; usa ml.inference.assess_churn_risk
    validators.py       → validate_dataframe (funcional)
  ml/
    churn.py            → heurística de cadência (fallback quando não há modelo)
    features.py         → extração de features (mesma lógica em treino e inferência)
    inference.py        → assess_churn_risk: modelo treinado se existir, senão heurística
    train.py            → treina GradientBoosting; `--data labels.csv` ou `--synthetic`
  alembic/              → migrações versionadas (baseline a gerar na primeira vez)
  tests/                → 77 testes (pytest): segurança, multi-tenant, LGPD, ML, reprocess, governança de IA...
```

### Frontend — Next.js 16 + TypeScript strict + shadcn/ui

```
frontend/
  app/page.tsx          → landing "Modern Tech Bright" (escopo .landing-2026)
  app/(auth)/           → login, signup, forgot/reset/onboarding (escopo .auth-2026, split-screen)
  app/dashboard/
    page.tsx            → visão geral com KPIs
    upload/             → upload de CSV + polling
    insights/           → gráficos + oportunidades
    clientes/[id]/      → perfil RFV
    history/            → histórico (paginado no backend, 200/req)
    team/               → gestão de equipe
    settings/           → perfil, empresa, plano, senha, notificações
    billing/            → checkout Stripe
    integrations/       → API Keys + Google Sheets
    carteira/           → Carteira Ativa + ranking
    disparo/            → WhatsApp (QR), canais, contatos, "Revisar e enviar"
  lib/api/client.ts     → cliente HTTP (credentials: 'include')
  lib/auth/             → AuthProvider + ProtectedRoute
  components/ui/        → shadcn/ui — NÃO editar diretamente
  components/landing/   → componentes da landing (CountUp, ScrollReveal, AppPreview...)
  components/dashboard/ → sidebar, header, command-menu
  e2e/smoke.spec.ts     → Playwright: landing + login + signup + redirect /dashboard
  types/index.ts        → interfaces TS (fonte de verdade)
```

### Visual — "Modern Tech Bright"

- **Paleta (claro, uso diário):** fundo off-white `oklch(0.985 0.002 270)`, índigo `oklch(0.52 0.21 277)` COM MODERAÇÃO (só ações/ativos), verde/vermelho semânticos (ganho/perda).
- **Tipografia:** corpo Geist, títulos **Bricolage Grotesque** (`--font-display`/`--font-serif` remapeados no `@theme` do `globals.css`). Root layout carrega `--font-bricolage`.
- **Escopo de tokens:** landing em `.landing-2026`, auth em `.auth-2026` (ambos sobrepõem shadcn sem tocar `globals.css`). App logado usa tokens globais em `:root` do `globals.css`.
- **Dark mode:** `.dark` calibrado pra slate-índigo (não Financial Ink).
- **NÃO edite** `components/ui/`, `globals.css` (exceto se for calibrar tokens), `types/index.ts`, `lib/api/client.ts`, `hooks/`.

---

## Fluxos de dados

### Fluxo 1 — Upload manual (CSV/XLSX)
```
POST /api/files/upload
  → valida MIME (libmagic) + extensão + 50 MB + limite de plano (atômico)
  → stream em chunks → salva em temp ou R2
  → grava source_ref em uploaded_files (habilita reprocessar se RETAIN_SOURCE_FILES=true)
  → dispara Celery: process_sales_file(file_id, company_id, file_ref)
  → Worker: acquires etl_lock:{company_id} (Redis, 2 min TTL)
  → ETL (ml.inference.assess_churn_risk) → ComputedInsights (upsert) + CustomerProfile (replace) + AnalysisResult
  → resolve_attributions (loop fechado de receita recuperada)
  → invalida cache Redis + deleta arquivo (a menos que RETAIN_SOURCE_FILES=true)
  → Frontend polling: GET /files/{id}/status a cada 2s
```

### Fluxo 1b — Reprocessamento opt-in
```
POST /api/files/{id}/reprocess   (admin/analyst)
  → verifica source_ref + storage.source_exists()
  → 409 se fonte não retida (padrão LGPD); 404 se cross-tenant
  → reenfileira process_sales_file com o mesmo file_ref
  → não conta contra cota de uploads
```

### Fluxo 2 — Ingestão via API Key
```
POST /api/data/ingest
  Header: X-API-Key: rc_live_xxxxxxxx
  Body: [{ data, cliente, produto, quantidade, valor, telefone?, email? }, ...]
  → autentica por SHA-256 hash
  → mesmo pipeline do Fluxo 1
```

### Fluxo 3 — Notificações diárias AO VENDEDOR
```
Celery Beat 08:00 BRT → send_daily_notifications
  → email (Resend) + WhatsApp (Cloud API Meta) por usuário
  → degrada sem RESEND_API_KEY / WHATSAPP_*
```

### Fluxo 4 — n8n → ERP → ingest
```
ERP (Omie/Bling/Conta Azul) → n8n (Schedule + HTTP + Code + HTTP) → POST /api/data/ingest
  → Fluxo 2 a partir daqui
  → Template: docs/integrations/n8n-generic-ingest.json
  → Docs: docs/integrations/n8n-erp.md
```

### Fluxo 5 — Disparo automático AO CLIENTE FINAL
```
Celery Beat horário → send_daily_outreach
  → OutreachConfig.auto_send_enabled + send_hour == hora BRT
  → run_company_outreach_task: seleciona at_risk/lost, sem opt-out, dedup 24h
  → generate_message (Claude Haiku; fallback estático)
  → WhatsApp (Evolution, número do vendedor) + Email (Resend)
  → grava OutreachLog + marca "contacted" na Carteira
  → sleep 8–25s anti-ban
```

---

## Modelos do banco (SQLAlchemy)

| Model | Tabela | Propósito |
|---|---|---|
| `Company` | companies | Empresa, plano, Stripe IDs |
| `User` | users | Usuário, role, `credential_version` (revogação JWT) |
| `UploadedFile` | uploaded_files | Upload; `source_ref` (reprocessamento opt-in) |
| `AnalysisResult` | analysis_results | Métricas agregadas por arquivo |
| `ComputedInsights` | computed_insights | Insights por `(company_id, date_range)`, upsert |
| `CustomerProfile` | customer_profiles | RFV + churn + `phone/email/contact_opt_out` |
| `NotificationPreference` | notification_preferences | Prefs digest do vendedor |
| `ApiKey` | api_keys | SHA-256 do key, nunca plaintext |
| `OpportunityAction` | opportunity_actions | Status comercial (to_contact/contacted/won/lost) |
| `IntegrationConfig` | integration_configs | Google Sheets sync |
| `OutreachConfig` | outreach_configs | Config de disparo ao cliente final |
| `OutreachLog` | outreach_logs | Log de envio (sem texto — LGPD); dedup 24h |
| `ContactOptOut` | contact_opt_outs | Opt-out durável (sobrevive re-upload) |
| `CadenceEnrollment` | cadence_enrollments | Cadência multi-toque |
| `OutreachAttribution` | outreach_attributions | Loop fechado de receita recuperada |

**Decisão de arquitetura:** não persistimos transações brutas — só métricas agregadas (LGPD/performance). **Exceção opt-in:** `RETAIN_SOURCE_FILES=true` retém o arquivo de origem para reprocessamento; **padrão false** (apaga após ETL). `CustomerProfile.phone/email` é PII necessária pro disparo — avisado na política de privacidade.

---

## Autenticação

### Usuários (JWT cookie)
- Cookie httpOnly `radar_session` (7 dias), payload `{ sub, company_id, role, cv }`
- `get_current_user_and_company`: valida token + 1 query por PK pra checar `credential_version` (revogação imediata pós-troca de senha)
- `COOKIE_SECURE` via env var (false local, true em prod)

### API Keys de ingestão
- Header `X-API-Key: rc_live_xxxxxxxx`; banco armazena SHA-256
- `validate_api_key` em `core/auth.py`

---

## Multi-tenancy e planos

Toda query filtra por `company_id` do JWT. **Nunca confiar no `company_id` da URL sem validar contra o token.**

| Plano | Uploads | Usuários |
|---|---|---|
| free | 5 | 1 |
| pro | 50 | 10 |
| enterprise | ∞ | ∞ |

---

## ETL — data_engine/etl.py

- `CANONICAL_COLUMNS`: sinônimos PT/EN → canônico (incluindo `telefone/celular/whatsapp → phone`).
- `process_sales_pipeline(path, company_id)`: entrypoint do worker, 100% em memória.
- `build_customer_profiles(df)`: perfis RFV + usa `ml.inference.assess_churn_risk` (modelo se existir, heurística senão).
- Suporta CSV e XLSX; normaliza datas em vários formatos; guard de defasagem >7 dias.

---

## ML — ml/

- `churn.py`: heurística de cadência — `assess_churn_risk(recency, interval, frequency)` → `{risk, score, days_overdue}`. Usado como fallback.
- `features.py`: vetor de 4 features (mesmo no treino e na inferência).
- `inference.py`: carrega `ml/model.joblib` (lazy, thread-safe); se não existir ou falhar → fallback heurístico. Mesma assinatura do heurístico.
- `train.py`: treina `GradientBoostingClassifier` (sklearn). `--synthetic` valida o pipeline sem dados reais. Dados reais = CSV `recency_days,avg_interval_days,frequency,label` (rótulos de OutreachAttribution/recovery).

> **Honesto:** o modelo só supera a heurística com **rótulos reais acumulados**. Hoje roda com fallback.

---

## Integrações externas

| Serviço | Uso | Status |
|---|---|---|
| **PostgreSQL (Neon)** | Banco principal | Ativo |
| **Redis (Upstash)** | Cache + Celery + idempotência Stripe + lock ETL + rate limit distribuído | Ativo |
| **Stripe** | Checkout + webhooks per-seat | Ativo |
| **Resend** | Email (notificações + disparo) | Integrado (degrada sem API key) |
| **WhatsApp Cloud API (Meta)** | Digest diário AO VENDEDOR | Integrado (degrada sem `WHATSAPP_*`) |
| **Evolution API** | WhatsApp AO CLIENTE FINAL (número do vendedor) | Implementado (self-hosted) |
| **Claude API (Haiku)** | Mensagens personalizadas | Implementado (fallback estático) |
| **Cloudflare R2 / Spaces** | Object storage de uploads | Implementado (degrada p/ disco) |
| **Google Sheets** | Pull agendado de vendas | Implementado |
| **n8n + ERPs** | Omie / Bling / Conta Azul → ingest | Documentado (`docs/integrations/`) |
| **Sentry** | Erros + traces (back + front) | Implementado (gated por `SENTRY_DSN`) |

---

## Variáveis de ambiente

### Obrigatórias
```
SECRET_KEY                # openssl rand -hex 32
DATABASE_URL              # PostgreSQL
REDIS_URL                 # Upstash ou local
CELERY_BROKER_URL         # mesmo Redis (também usado pelo rate limiter)
STRIPE_SECRET_KEY
STRIPE_PRICE_PRO
STRIPE_PRICE_ENTERPRISE
STRIPE_WEBHOOK_SECRET
ALLOWED_ORIGINS           # ex: http://localhost:3000
COOKIE_SECURE             # false local, true em prod
```

### Opcionais (degradação graciosa se ausentes)
```
RESEND_API_KEY            # email
RESEND_FROM_EMAIL         # remetente (domínio verificado)
WHATSAPP_API_TOKEN        # digest ao vendedor (Cloud API Meta)
WHATSAPP_PHONE_NUMBER_ID
EVOLUTION_API_URL         # disparo ao cliente (Evolution)
EVOLUTION_API_KEY
ANTHROPIC_API_KEY         # IA (Claude Haiku)
AI_MESSAGE_DAILY_LIMIT    # teto diário de gerações de IA por empresa (default 100; 0 desabilita)
APP_BASE_URL              # link nos emails
SENTRY_DSN                # observabilidade backend
SENTRY_ENVIRONMENT        # production (default)
SENTRY_TRACES_SAMPLE_RATE # 0.0 (default)
LOG_LEVEL                 # INFO (default)
RETAIN_SOURCE_FILES       # false (default/LGPD); true habilita reprocessamento
CHURN_MODEL_PATH          # path do model.joblib (default: ml/model.joblib)
GOOGLE_SERVICE_ACCOUNT_JSON
SHEETS_SYNC_INTERVAL_HOURS
DEBUG_WEBHOOK             # false — NUNCA true em prod
```

Frontend: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SENTRY_DSN` em `frontend/.env.local`.

---

## CI/CD — .github/workflows/ci.yml

3 jobs em paralelo em cada PR/push para `main`:
- **backend**: pytest (77 testes) com serviço Redis + libmagic
- **frontend**: lint + build
- **e2e**: Playwright smoke (4 testes: landing, login, signup, redirect /dashboard)

---

## Padrões obrigatórios

- **Resposta de API:** `{ "success": true, "data": ... }` ou `{ "success": false, "error": "..." }`. O cliente TS espera `ApiResponse<T>`.
- **Logs:** `logger.info("dominio.acao", extra={...})` — nunca `print()`.
- **Operações bloqueantes** → Celery, nunca inline no request.
- **Multi-tenancy:** toda query filtra por `company_id` do JWT.
- **TypeScript:** `strict: true` ligado. Sem `any`. Tipos em `types/index.ts`.
- **API routes novas:** registrar em `app/main.py` + `lib/api/client.ts` + `types/index.ts`.
- **Cache Redis:** insights = 900s. Invalidar em `_invalidate_insights_cache`.
- **Visual:** NÃO editar `components/ui/`, `globals.css` direto (use escopos `.landing-2026`/`.auth-2026` ou atualize tokens em `:root`), `types/index.ts`, `lib/api/client.ts`, `hooks/`.

---

## Segurança — estado atual

| Item | Status |
|---|---|
| Rate limiting em auth/ingest/oportunidades/outreach | ✅ (slowapi + Redis + X-Forwarded-For) |
| Cookie httpOnly + `COOKIE_SECURE` + samesite | ✅ |
| CORS `ALLOWED_ORIGINS` via env | ✅ |
| Multi-tenancy: `company_id` URL validado vs JWT | ✅ |
| Upload: MIME real (libmagic) + 50 MB + streaming + cota atômica | ✅ |
| Stripe webhook: verifica assinatura (`construct_event`) | ✅ |
| Evolution webhook: token HMAC (`webhook_sign.py`) | ✅ |
| JWT revogação por `credential_version` | ✅ |
| bcrypt + força de senha + email normalizado | ✅ |
| API Key: armazena SHA-256, nunca plaintext | ✅ |
| Container não-root; sem `--reload` em prod | ✅ |
| Sem segredos no git | ✅ |
| Security headers + HSTS (gated) | ✅ |
| Observabilidade: Sentry + logging central | ✅ (gated) |
| Migrações versionadas (Alembic) | ✅ (scaffolding — baseline a gerar) |
| Sem rate limit nas demais rotas | ⚠️ monitorar |

> **Migração de schema:** convivem `create_all` + `_ensure_columns` (histórico) e Alembic (novo). Rodar `alembic revision --autogenerate -m "baseline" && alembic upgrade head` na primeira vez com o banco apontado.
