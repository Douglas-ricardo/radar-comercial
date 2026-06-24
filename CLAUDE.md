# CLAUDE.md

Guia de contexto para Claude Code. Leia antes de tocar em qualquer arquivo.

---

## Visão geral do produto

**Radar Comercial** — SaaS B2B multi-tenant que processa histórico de vendas (CSV, API ou ERP) de empresas e gera:
- Insights de receita perdida e clientes inativos
- Oportunidades de recuperação com valor esperado calculado
- Notificações diárias automáticas para o time comercial (email/WhatsApp)
- Mensagens personalizadas geradas por IA para cada oportunidade

**Público-alvo:** gestores comerciais e vendedores de PMEs a grandes empresas (enterprise).
**Diferencial:** oportunidades já qualificadas com histórico real — o HubSpot não tem isso nativamente.
**Monetização:** cobrança **per-seat no Stripe** — `quantity` = nº de usuários da empresa.

> **NOTA DE PRECISÃO (sincronizado com o código em 2026-06-23):** Todos os níveis 1–5 estão concluídos. Nível 5 (Prontidão Enterprise) entregue em 6 commits: MFA (TOTP) + sessões revogáveis + IP allowlist; SSO (OIDC + SAML 2.0) + SCIM 2.0; RBAC customizável + hierarquia organizacional; auditoria completa + retenção + portabilidade LGPD; CRM bidirecional (HubSpot/Salesforce/Pipedrive) + cohorts + saved views + multi-moeda; metering de uso + quotas por plano + status/SLA público + sandbox. Ver histórico de commits (branch `redesign/estrutural`).

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
| Rate limit via Redis (multi-instância + X-Forwarded-For + headers) | ✅ implementado | `app/core/rate_limit.py` (`headers_enabled=True`) |
| Migrações versionadas (Alembic) | ✅ aplicadas | `backend/alembic/` (6 migrações Nível 5 + baseline) |
| Frontend: testes E2E (Playwright) | ✅ implementado | `frontend/e2e/smoke.spec.ts` |
| Frontend: TypeScript strict | ✅ ligado | `frontend/tsconfig.json` |
| Redesign visual "Modern Tech Bright" | ✅ implementado | Landing + auth (`.landing-2026`/`.auth-2026`) + app (tokens globais em `globals.css`) |
| **MFA (TOTP) + backup codes** | ✅ implementado | `app/api/mfa.py`, `app/services/mfa_service.py` |
| **Sessões revogáveis (UserSession)** | ✅ implementado | `app/core/sessions.py`, `GET/DELETE /auth/sessions` |
| **IP allowlist por empresa (enterprise)** | ✅ implementado | `Company.ip_allowlist`, verificado no login |
| **SSO OIDC** (Azure AD, Google Workspace, Okta) | ✅ implementado | `app/api/sso.py`, `app/services/sso_service.py` |
| **SSO SAML 2.0** (Okta, ADFS, OneLogin) | ✅ implementado | `app/api/sso.py` (requer `xmlsec1` em runtime) |
| **JIT provisioning** (SSO → cria/reusa User) | ✅ implementado | `sso_service.jit_provision` |
| **SCIM 2.0** (provisionamento Okta/Azure) | ✅ implementado | `app/api/scim.py`, `ScimToken` |
| **RBAC customizável** (15 permissões, papéis custom) | ✅ implementado | `app/core/permissions.py`, `app/api/roles.py` |
| **Hierarquia organizacional** (região→filial→equipe) | ✅ implementado | `OrgUnit`, `app/api/org_units.py` |
| **Auditoria completa** (filtros + export CSV + retenção) | ✅ implementado | `app/api/audit.py`, `compliance_tasks.purge_old_audit_logs` |
| **Portabilidade de dados** (ZIP LGPD/GDPR por email) | ✅ implementado | `compliance_tasks.build_company_export`, download com token Redis |
| **CRM bidirecional** (HubSpot, Salesforce, Pipedrive) | ✅ implementado | `app/services/crm/`, `app/workers/crm_tasks.py` |
| **Análise de cohorts** (retenção por safra) | ✅ implementado | `GET /insights/{id}/cohorts`, `components/insights/cohort-card.tsx` |
| **Saved views** (filtros salvos por usuário) | ✅ implementado | `SavedView`, `app/api/saved_views.py` |
| **Multi-moeda** (ISO 4217, `formatCurrency`) | ✅ implementado | `Company.currency`, `frontend/lib/utils.ts` |
| **Metering de uso por tenant** (api_call/upload/ai/outreach) | ✅ implementado | `UsageEvent`, `app/services/usage_service.py` |
| **Quotas por plano** (free/pro; enterprise ilimitado) | ✅ implementado | `DAILY_QUOTAS` + `check_quota` |
| **Status / SLA público** (`/status`) | ✅ implementado | `app/api/status.py`, `frontend/app/status/page.tsx` |
| **Sandbox tenant** (dados demo) | ✅ implementado | `Company.is_sandbox`, `app/services/demo_seed.py` |

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
# Fluxo normal: após mudar models.py
alembic revision --autogenerate -m "descricao"
alembic upgrade head

# Ver histórico aplicado
alembic history --verbose
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
      auth.py           → login (2 passos c/ MFA), signup, logout, change-password, sessions
      mfa.py            → setup/enable/disable MFA + backup codes [NOVO Nível 5]
      sso.py            → conexões SSO, OIDC/SAML flows, SCIM token, discover [NOVO Nível 5]
      scim.py           → SCIM 2.0: GET/POST/PATCH/PUT/DELETE /scim/v2/Users [NOVO Nível 5]
      roles.py          → RBAC custom: GET/POST/PATCH/DELETE /roles [NOVO Nível 5]
      org_units.py      → hierarquia: GET/POST/PATCH/DELETE /org-units [NOVO Nível 5]
      saved_views.py    → GET/POST/DELETE /saved-views [NOVO Nível 5]
      status.py         → GET /api/status (público; health API/DB/Redis/Celery) [NOVO Nível 5]
      files.py          → upload (50 MB, stream), status, list (paginado), delete, reprocess
      insights.py       → GET /insights/{id}?date_range= + GET /insights/{id}/cohorts
      customers.py      → GET /customers/{company_id}/{customer_id}
      team.py           → list, invite, remove, updateRole (suporta role_id/org_unit_id)
      account.py        → PATCH /users/{id}, PATCH/GET /company/{id}, usage, export, seed-demo
      audit.py          → GET /audit/{id}/log (filtros) + GET /audit/{id}/export (CSV)
      billing.py        → Stripe checkout + webhook
      carteira.py       → Carteira Ativa: list + upsert-action + ranking (visib. OrgUnit)
      notifications.py  → preferências + test-send
      integrations.py   → API Keys + POST /data/ingest + CRM connections
      opportunities.py  → POST /{id}/generate-message (IA Claude Haiku)
      outreach.py       → config + QR + contatos + preview + send-now + webhook Evolution
    core/
      auth.py           → get_current_user_and_company (resolve permissões + verifica sessão)
      crypto.py         → encrypt/decrypt Fernet (SSO_ENC_KEY ou derivado de SECRET_KEY) [NOVO]
      sessions.py       → create/is_revoked/revoke UserSession [NOVO]
      login_session.py  → issue_login() — helper compartilhado auth+SSO [NOVO]
      permissions.py    → PERMISSION_CATALOG (15), PRESETS, require_permission(), visible_branches() [NOVO]
      rate_limit.py     → Limiter slowapi + Redis + X-Forwarded-For + headers_enabled=True
      celery_app.py     → config + beat_schedule
      security.py       → JWT, bcrypt, força de senha
      observability.py  → configure_logging() + init_sentry() — gated, degrada sem SENTRY_DSN
      clock.py          → utcnow() (testável)
      unsubscribe.py    → tokens de unsubscribe LGPD
      webhook_sign.py   → HMAC para webhook Evolution
    domain/
      models.py         → todos os models SQLAlchemy (ver tabela abaixo)
    infrastructure/
      database.py       → engine + SessionLocal + _ensure_columns (convive com Alembic)
      redis_client.py   → singleton Redis
      storage.py        → R2/Spaces + source_exists() + degradação p/ disco
    services/
      plan_service.py   → limites por plano + has_feature/require_feature (enterprise gates)
      mfa_service.py    → generate_secret, provisioning_uri, verify_totp, backup codes [NOVO]
      sso_service.py    → ensure_slug, jit_provision, OIDC/SAML flows [NOVO]
      usage_service.py  → record_usage, check_quota, DAILY_QUOTAS [NOVO]
      demo_seed.py      → seed 12 CustomerProfile + insights para sandbox [NOVO]
      crm/              → [NOVO]
        base.py         → CrmConnector ABC + encrypt/decrypt credentials + get_connector factory
        hubspot.py      → Bearer token + /crm/v3/objects/contacts + push deal
        pipedrive.py    → api_token query param + /v1/persons + push deal
        salesforce.py   → access_token + instance_url + SOQL + push Opportunity
      notification_service.py → Resend + WhatsApp Cloud API Meta
      evolution_client.py → cliente Evolution API
      outreach_service.py → dispatcher + IA + sync Carteira + atribuição
      pdf_report.py     → relatório PDF (fpdf2)
    workers/
      tasks.py          → process_sales_file + lock ETL + RETAIN_SOURCE_FILES
      notification_tasks.py → send_daily_notifications
      compliance_tasks.py → purge_old_audit_logs + build_company_export [NOVO]
      crm_tasks.py      → sync_crm_contacts + push_crm_deal [NOVO]
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
  alembic/              → migrações versionadas (aplicadas: baseline + 6 migrações Nível 5)
  tests/                → 79 testes (pytest): segurança, multi-tenant, LGPD, ML, reprocess, MFA, RBAC, quotas...
```

### Frontend — Next.js 16 + TypeScript strict + shadcn/ui

```
frontend/
  app/page.tsx          → landing "Modern Tech Bright" (escopo .landing-2026)
  app/(auth)/           → login (2 passos MFA + botão SSO), signup, forgot/reset/onboarding
  app/status/page.tsx   → status/SLA público (auto-refresh 30s) [NOVO Nível 5]
  app/dashboard/
    page.tsx            → visão geral com KPIs
    upload/             → upload de CSV + polling
    insights/           → gráficos + oportunidades + cohort heatmap
    clientes/[id]/      → perfil RFV
    history/            → histórico (paginado no backend, 200/req)
    team/               → gestão de equipe (suporta Role/OrgUnit no convite)
    settings/           → abas: Perfil, Empresa, Plano, Senha, Notificações,
                          Segurança (MFA+sessões+IP), SSO (OIDC/SAML/SCIM),
                          Papéis & Permissões, Compliance (audit+export), Uso & Quotas
    billing/            → checkout Stripe
    integrations/       → API Keys + Google Sheets + CRM (HubSpot/Salesforce/Pipedrive)
    carteira/           → Carteira Ativa + ranking
    disparo/            → WhatsApp (QR), canais, contatos, "Revisar e enviar"
  lib/api/client.ts     → cliente HTTP (credentials: 'include')
  lib/auth/             → AuthProvider + ProtectedRoute
  lib/utils.ts          → formatCurrency (Intl, respeita Company.currency) [atualizado]
  components/ui/        → shadcn/ui — NÃO editar diretamente
  components/landing/   → componentes da landing (CountUp, ScrollReveal, AppPreview...)
  components/dashboard/ → sidebar, header, command-menu
  components/settings/
    security-tab.tsx    → MFA QR/enable/disable, sessions list, IP allowlist [NOVO]
    sso-tab.tsx         → SSO connections CRUD, SCIM token, URLs de callback [NOVO]
    rbac-tab.tsx        → matriz de permissões + árvore de org units [NOVO]
    compliance-tab.tsx  → retenção, export ZIP LGPD, audit log c/ filtros + CSV [NOVO]
    usage-card.tsx      → barras de uso/quota por tipo (api_call/upload/ai/outreach) [NOVO]
  components/integrations/
    crm-section.tsx     → cards HubSpot/Pipedrive/Salesforce (conectar/sync) [NOVO]
  components/insights/
    cohort-card.tsx     → heatmap de retenção por safra de cliente [NOVO]
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
  → record_usage(company_id, "upload") → check_quota (free: 5/dia total; via plan_service)
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
  → record_usage(company_id, "api_call")
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
  → check_quota(company, "outreach") — free: 20/dia; pro: 500/dia
  → generate_message (Claude Haiku; fallback estático)
  → record_usage(company_id, "ai_generation")
  → WhatsApp (Evolution, número do vendedor) + Email (Resend)
  → grava OutreachLog + marca "contacted" na Carteira
  → push_crm_deal.delay se CRM conectado e status won/lost
  → sleep 8–25s anti-ban
```

### Fluxo 6 — Login com MFA (Nível 5)
```
POST /auth/login (email + senha)
  → valida credenciais + status "active" + IP allowlist
  → SE user.mfa_enabled:
      → retorna { mfaRequired: true, mfaToken } sem cookie
      → Frontend: pede código TOTP ou backup code
      → POST /auth/mfa/verify { mfaToken, code }
        → verifica TOTP (válido ±30s) ou backup code (consome 1)
        → cria UserSession → emite cookie radar_session
  → SENÃO: cria UserSession → emite cookie direto
```

### Fluxo 7 — Login via SSO (Nível 5)
```
GET /sso/discover?email=user@empresa.com
  → descobre SSOConnection pelo domínio do email
  → retorna { found, protocol, loginUrl }
  → Frontend redireciona para loginUrl

OIDC: GET /sso/{slug}/oidc/login → IdP → GET /sso/oidc/callback
  → valida state (Redis, TTL 10min) + troca code por tokens
  → valida email domain vs allowed_domains
  → jit_provision: cria ou reusa User (role = default_role)
  → emite cookie (mesmo que login normal)

SAML: GET /sso/{slug}/saml/login → POST IdP → POST /sso/saml/acs
  → valida asserção (pysaml2; requer xmlsec1)
  → jit_provision + emite cookie
```

### Fluxo 8 — Exportação de dados LGPD (Nível 5)
```
POST /api/account/{company_id}/export-request (admin)
  → log_action("data.exported")
  → Celery: build_company_export(company_id, user_id)
    → ZIP de 10 JSONs (insights, profiles, carteira, audit, config, outreach...)
    → armazena R2 ou disco
    → grava token Redis (24h TTL) → email com link download
GET /api/account/{company_id}/export/download?token=...
  → valida token Redis → stream ZIP → delete token (uso único)
```

---

## Modelos do banco (SQLAlchemy)

| Model | Tabela | Propósito |
|---|---|---|
| `Company` | companies | Empresa, plano, Stripe IDs, `ip_allowlist`, `sso_slug`, `audit_retention_days`, `currency`, `is_sandbox` |
| `User` | users | Usuário, role, `credential_version`, `mfa_enabled/secret/backup_codes`, `role_id` (FK→roles), `org_unit_id` (FK→org_units), `status` |
| `UserSession` | user_sessions | Sessão durável: ip, user_agent, revoked_at; índice em `(user_id, revoked_at)` |
| `SSOConnection` | sso_connections | Protocolo OIDC/SAML, config cifrado Fernet, allowed_domains, default_role |
| `ScimToken` | scim_tokens | Bearer token SHA-256 para provisionamento SCIM |
| `Role` | roles | Papel customizável: permissions (JSON), is_system (presets) |
| `OrgUnit` | org_units | Hierarquia self-referencial (região→filial→equipe) |
| `CrmConnection` | crm_connections | Credenciais Fernet, field_map, sync status, push_enabled |
| `SavedView` | saved_views | Filtros/layout salvos por usuário por página |
| `UsageEvent` | usage_events | Contador diário por (company_id, kind, day) — unique constraint |
| `UploadedFile` | uploaded_files | Upload; `source_ref` (reprocessamento opt-in) |
| `AnalysisResult` | analysis_results | Métricas agregadas por arquivo |
| `ComputedInsights` | computed_insights | Insights por `(company_id, date_range)`, upsert |
| `CustomerProfile` | customer_profiles | RFV + churn + `phone/email/contact_opt_out` + `monthly_revenue` (cohorts) |
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

### Usuários (JWT cookie + sessão durável)
- Cookie httpOnly `radar_session` (7 dias), payload `{ sub, company_id, role, cv, sid, permissions, org_unit_id }`
- `get_current_user_and_company`: valida token + checa `credential_version` + checa `UserSession` revogado (Redis cache 5min, fallback DB)
- `COOKIE_SECURE` via env var (false local, true em prod)
- **MFA:** se `user.mfa_enabled`, login emite `mfaToken` (Redis, TTL 5min) sem cookie; `POST /auth/mfa/verify` valida TOTP/backup e aí emite cookie

### API Keys de ingestão
- Header `X-API-Key: rc_live_xxxxxxxx`; banco armazena SHA-256
- `validate_api_key` em `core/auth.py`

### SSO (enterprise)
- OIDC: `authlib` — code flow, JWKS validation. Conexão configurada por `SSOConnection.config` (cifrado Fernet).
- SAML: `pysaml2` — SP-initiated. Requer `xmlsec1` no PATH; rota retorna 503 sem ele.
- JIT provisioning: cria/reusa `User` por email + domínio permitido. Role = `SSOConnection.default_role`.

### SCIM (enterprise)
- Bearer `ScimToken` — SHA-256. Soft-deactivate (`user.status = "disabled"`) incrementa `credential_version` bloqueando login imediato.

---

## Multi-tenancy, planos e permissões

Toda query filtra por `company_id` do JWT. **Nunca confiar no `company_id` da URL sem validar contra o token.**

| Plano | Uploads | Usuários | Features enterprise |
|---|---|---|---|
| free | 5 | 1 | — |
| pro | 50 | 10 | — |
| enterprise | ∞ | ∞ | SSO, SCIM, RBAC custom, CRM sync, data export, IP allowlist |

### RBAC — 15 permissões em 5 grupos

| Grupo | Permissões |
|---|---|
| Análise | `insights.read`, `customers.read`, `cohorts.read` |
| Carteira | `carteira.read`, `carteira.write`, `carteira.ranking` |
| Disparo | `outreach.read`, `outreach.write`, `outreach.config` |
| Time | `team.read`, `team.manage`, `roles.manage` |
| Admin | `billing.read`, `audit.read`, `company.manage` |

Presets `admin/analyst/viewer` mapeados automaticamente. `User.role_id = NULL` → usa preset legado.

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
| **Redis (Upstash)** | Cache + Celery + idempotência Stripe + lock ETL + rate limit + sessão MFA + tokens export | Ativo |
| **Stripe** | Checkout + webhooks per-seat | Ativo |
| **Resend** | Email (notificações + disparo + export LGPD) | Integrado (degrada sem API key) |
| **WhatsApp Cloud API (Meta)** | Digest diário AO VENDEDOR | Integrado (degrada sem `WHATSAPP_*`) |
| **Evolution API** | WhatsApp AO CLIENTE FINAL (número do vendedor) | Implementado (self-hosted) |
| **Claude API (Haiku)** | Mensagens personalizadas | Implementado (fallback estático) |
| **Cloudflare R2 / Spaces** | Object storage de uploads + export ZIP LGPD | Implementado (degrada p/ disco) |
| **Google Sheets** | Pull agendado de vendas | Implementado |
| **n8n + ERPs** | Omie / Bling / Conta Azul → ingest | Documentado (`docs/integrations/`) |
| **Sentry** | Erros + traces (back + front) | Implementado (gated por `SENTRY_DSN`) |
| **HubSpot** | CRM bidirecional (enterprise) | Implementado (`crm/hubspot.py`) |
| **Salesforce** | CRM bidirecional (enterprise) | Implementado (`crm/salesforce.py`) |
| **Pipedrive** | CRM bidirecional (enterprise) | Implementado (`crm/pipedrive.py`) |

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
# Nível 5 — Enterprise
SSO_ENC_KEY               # Fernet key p/ cifrar config SSO/CRM/MFA (OBRIGATÓRIO em prod)
                          # Dev: derivado automaticamente de SECRET_KEY (inseguro em prod)
```

Frontend: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SENTRY_DSN` em `frontend/.env.local`.

---

## CI/CD — .github/workflows/ci.yml

3 jobs em paralelo em cada PR/push para `main`:
- **backend**: pytest (79 testes) com serviço Redis + libmagic
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
- **Features enterprise:** gatar via `plan_service.require_feature(company, "sso")` antes de executar. Features: `sso`, `scim`, `crm_sync`, `custom_rbac`, `data_export`, `ip_allowlist`.
- **Credenciais de terceiros (SSO/CRM):** sempre cifrar com `crypto.encrypt()` antes de persistir. Nunca armazenar plaintext.
- **Audit obrigatório em:** login/logout, troca de papel, billing, SSO config, export de dados, deleção de recursos.

---

## Segurança — estado atual

| Item | Status |
|---|---|
| Rate limiting em auth/ingest/oportunidades/outreach | ✅ (slowapi + Redis + X-Forwarded-For + X-RateLimit-* headers) |
| Cookie httpOnly + `COOKIE_SECURE` + samesite | ✅ |
| CORS `ALLOWED_ORIGINS` via env | ✅ |
| Multi-tenancy: `company_id` URL validado vs JWT | ✅ |
| Upload: MIME real (libmagic) + 50 MB + streaming + cota atômica | ✅ |
| Stripe webhook: verifica assinatura (`construct_event`) | ✅ |
| Evolution webhook: token HMAC (`webhook_sign.py`) | ✅ |
| JWT revogação por `credential_version` | ✅ |
| Sessões revogáveis individualmente (UserSession + Redis cache) | ✅ |
| bcrypt + força de senha + email normalizado | ✅ |
| API Key: armazena SHA-256, nunca plaintext | ✅ |
| SCIM token: armazena SHA-256, nunca plaintext | ✅ |
| Config SSO/CRM: cifrado Fernet (`SSO_ENC_KEY`) | ✅ |
| MFA secret: cifrado Fernet em repouso | ✅ |
| MFA TOTP + backup codes (10, consumíveis) | ✅ |
| IP allowlist (enterprise): CIDR whitelist no login | ✅ |
| Container não-root; sem `--reload` em prod | ✅ |
| Sem segredos no git | ✅ |
| Security headers + HSTS (gated) | ✅ |
| Observabilidade: Sentry + logging central | ✅ (gated) |
| Migrações versionadas (Alembic) | ✅ (6 migrações Nível 5 aplicadas) |
| Audit log completo com ip/user_agent + retenção configurável | ✅ |
| Sem rate limit nas demais rotas | ⚠️ monitorar |
| SAML requer `xmlsec1` no PATH (rota retorna 503 sem ele) | ⚠️ verificar em prod |
| `SSO_ENC_KEY` deve ser set em prod (fallback dev usa SECRET_KEY) | ⚠️ configurar antes de go-live |

---

## Pendências honestas (não são bugs — dependem de contexto externo)

- **SSO round-trip real:** requer credenciais de IdP real (Okta/Azure/Google Workspace). O fluxo está implementado e testado unitariamente, mas login ponta-a-ponta precisa de IdP configurado.
- **SAML em produção:** requer `xmlsec1` instalado no container (`apt-get install xmlsec1`).
- **CRM round-trip:** pull/push reais requerem credenciais OAuth/token válidas do cliente. Fluxo e clientes implementados; teste de integração requer conta no HubSpot/Salesforce/Pipedrive.
- **Modelo ML:** supera heurística só com rótulos reais acumulados via `OutreachAttribution`. Hoje roda fallback heurístico.
- **UI de saved views na carteira:** API + client prontos; componente de seleção no dashboard fica para próxima iteração.
