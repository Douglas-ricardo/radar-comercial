# 00 — Inventário do que existe (Fase 1)

> Auditoria READ-ONLY do estado **real** do código em `2026-06-16`. Princípio: confiar no código, não no `CLAUDE.md`. Toda linha vem de arquivo lido; inferências marcadas `[suposição]`.

## Achado-síntese da Fase 1

**O `CLAUDE.md` está desatualizado e CONSERVADOR.** Quase tudo marcado como `[PLANEJADO]` já está construído e ligado a backend real: Ingestão por API Key, Notificações (email+WhatsApp), Carteira Ativa, forgot/reset password. A documentação subestima o produto — o oposto do risco que normalmente se audita.

**Três exceções/contradições materiais:**
1. **IA (Claude/Anthropic) não existe** — zero código. Única peça do roadmap realmente não iniciada.
2. **O "Data Warehouse local em Parquet + `etl_lock` Redis" descrito no CLAUDE.md NÃO existe** — o ETL roda 100% em memória e explicitamente não persiste nada (`etl.py:481-483`).
3. **Cobrança é flat por tier (`quantity:1`), não "por usuário" nem "por upload"** como a doc afirma.

E **dois bugs que importam**: ranking quebra para `analyst` (`KeyError`), e mismatch camelCase/snake_case esvazia o conteúdo das notificações e neutraliza o filtro de valor mínimo.

---

## Tabela mestre: feature → estado real → evidência

Estados: **funcional** · **parcial** · **stub-vazio** · **só-planejado**

### Backend — API & domínio

| Feature | Estado real | Evidência | Observação |
|---|---|---|---|
| Auth (login/signup/logout/me/change-password) | funcional | `app/api/auth.py:85-221` | JWT cookie httpOnly, bcrypt, rate limit |
| Forgot/Reset password | funcional | `app/api/auth.py:224-312` | Não documentado no CLAUDE.md; token Redis TTL 30min + Resend |
| Upload (stream, MIME, limite de plano) | funcional | `app/api/files.py:48-180` | UPDATE atômico de `uploads_used`; rollback em falha |
| Status/list/delete de arquivos | funcional | `app/api/files.py:183-266` | — |
| Insights (cache Redis 900s) | funcional | `app/api/insights.py:21-70` | Valida `company_id` URL vs JWT |
| Customer profile (RFV) | funcional | `app/api/customers.py:12-45` | — |
| Team (list/invite/remove/role/resend) | funcional | `app/api/team.py:47-232` | Email de convite via NotificationService |
| Account (PATCH user/company) | funcional | `app/api/account.py` | — |
| Billing (Stripe checkout + webhook idempotente) | funcional | `app/api/billing.py:74-269` | + endpoint `/debug-sync-plan` gated por `DEBUG_WEBHOOK` |
| ETL completo | funcional | `data_engine/etl.py:1-516` | Normalização multi-formato, insights por range, RFV, oportunidades |
| Validators | **funcional** (NÃO vazio) | `data_engine/validators.py:1-85` | CLAUDE.md diz "placeholder vazio" — **FALSO**. `validate_dataframe` usado em `etl.py:136` |
| Ingestão por API Key | **funcional** | `app/api/integrations.py:52-196` + `core/auth.py:76-100` | CRUD keys + `POST /api/data/ingest`, SHA-256. Doc: [PLANEJADO] |
| Notificações (email+WhatsApp) | **funcional** (com bug de conteúdo) | `api/notifications.py`, `services/notification_service.py`, `workers/notification_tasks.py`, `celery_app.py:29-34` | Resend+Twilio + Celery Beat 11:00 UTC. Doc: [PLANEJADO]. **Ver bug #2** |
| Carteira Ativa | **funcional** (com bug) | `app/api/carteira.py:28-186` | list/upsert-action/ranking. Doc: [PLANEJADO]. **Ver bug #1** |
| IA / Claude (mensagem personalizada) | **só-planejado / inexistente** | grep backend: 0 ocorrências `anthropic`/`claude` | Etapa 3 não iniciada |
| `ml/` (features/train/inference) | **stub-vazio** | `ml/*.py` = 0 bytes | Coerente com a doc ("usar Claude API, não ML local") |

### Frontend — telas & fluxos

> Nenhum dado mockado/hardcoded em todo o frontend. Todas as páginas passam por `lib/api/client.ts`; todos os 30+ endpoints chamados têm router correspondente. Zero endpoint órfão.

| Página / Fluxo | Estado real | Evidência | Observação |
|---|---|---|---|
| Login / Signup | funcional | `app/(auth)/login`, `signup/page.tsx` | via auth-context |
| Forgot / Reset password | funcional | `app/(auth)/forgot-password`, `reset-password/page.tsx` | Não está no CLAUDE.md |
| Onboarding | funcional | `app/(auth)/onboarding/page.tsx` | setor/funcionários coletados mas **sem endpoint para persistir** |
| Dashboard (overview) | funcional | `app/dashboard/page.tsx` | KPIs/gráfico/listas reais |
| Upload | funcional | `app/dashboard/upload/page.tsx` + `hooks/use-file-upload.ts` | XHR progress + polling 60×2s |
| Insights | funcional | `app/dashboard/insights/page.tsx` | "Exportar PDF" = `window.print()` |
| Cliente [id] | funcional | `app/dashboard/clientes/[id]/page.tsx` | perfil RFV completo |
| History | funcional | `app/dashboard/history/page.tsx` | coluna "Período" = texto fixo (cosmético) |
| Team | funcional | `app/dashboard/team/page.tsx` | bloqueio de plano free no front |
| Settings (Perfil/Senha/Empresa/Plano) | funcional | `app/dashboard/settings/page.tsx` | — |
| **Settings — Notificações** | funcional | aba `notifications` em settings | Doc: [PLANEJADO]; ligada a backend |
| Billing | funcional | `app/dashboard/billing/page.tsx` | trata `?upgraded=1`/`?cancelled=1` |
| **Integrations (API Keys)** | funcional | `app/dashboard/integrations/page.tsx` | Doc: [PLANEJADO]; CRUD completo |
| **Carteira Ativa** | funcional | `app/dashboard/carteira/page.tsx` | Doc: [PLANEJADO]; oportunidades+ranking+ações |

### Segurança & Infra

| Item | Estado real | Evidência | Observação |
|---|---|---|---|
| `.env` versionado com segredos | **NÃO** (OK) | `git ls-files` só mostra `*.example`; `git log --all` limpo | Alerta do CLAUDE.md "revogar chaves" não corresponde ao git atual |
| `.env.example` | existe e correto | `backend/.env.example` só placeholders | Item "pendente" do CLAUDE.md já resolvido |
| `.gitignore` | correto | raiz linhas 2-5 ignora `.env`, `*.pem` | — |
| Segredos hardcoded no código | nenhum | `os.getenv` em auth/billing/redis | exceção: senha PG em `docker-compose.yml:55-57` (dev local) |
| Dockerfile / docker-compose | existem | `backend/Dockerfile`, `backend/docker-compose.yml` (5 serviços) | `--reload` no compose (impróprio p/ prod); roda como root |
| Multi-tenancy (URL vs JWT) | correto | `insights.py:28-29`, `customers.py:19-20`, `files.py:191-253` | 403 se `company_id` URL ≠ token |
| Rate limiting | correto | `main.py:19-22` + por rota em `auth.py` | login 10/min, signup 5/min, etc. |
| Cookie/upload/webhook/senhas | corretos | `auth.py:117-161`, `files.py:64-142`, `billing.py:120-146`, `security.py` | bcrypt, libmagic, streaming 50MB, assinatura Stripe |
| Configs CI/deploy (Railway/Render/Fly/vercel.json) | inexistentes | repositório | `@vercel/analytics` sugere Vercel `[suposição]` |

### Dados & Negócio (interpretação, herda estado do Backend)

| Tema | Realidade no código | Evidência |
|---|---|---|
| O que entrega hoje | KPIs por 1m/3m/6m/12m, churn>60d (vs `max_date` do arquivo, não hoje), oportunidades top-15, RFV completo | `etl.py:191,144-148,258-274,329-474` |
| "Oportunidade" = | cliente inativo; `expectedValue = valor/2` (heurística fixa); `product`/`frequency` hardcoded | `etl.py:265-271` |
| Cobrança real | **flat por tier** via Stripe subscription `quantity:1`; preços só em env vars | `billing.py:95-96,184-185`, `plan_service.py:5-6` |
| vs CLAUDE.md ("por usuário"/"por upload") | **Nenhum dos dois.** Upload limita (gating) mas não fatura; não há per-seat/metered | confronto direto |
| Notificação automática (diferencial) | estrutura de dados pronta (`NotificationPreference`), worker/Beat existem, **mas conteúdo sai vazio por bug** e IA inexistente | ver bugs #1/#2 |
| Não-persistência de bruto | impede reprocessamento sem re-upload; janelas fixas; sem drill-down; teto p/ IA granular | `models.py:73-97`, `etl.py:332,482-483` |

---

## Incoerências e bugs encontrados (validação estática)

1. **[BUG, quebra] `carteira.py:183`** — ranking para role `analyst` filtra por `r["user_id"]`, mas os dicts usam chave `"userId"` (camelCase, montada em `:170`) → `KeyError: 'user_id'`. Endpoint quebra para analysts; funciona para admin.

2. **[BUG, esvazia conteúdo] mismatch camelCase ↔ snake_case nas oportunidades:**
   - ETL gera `customerHash`, `customer`, `expectedValue`, `daysInactive` (`etl.py:258-274`).
   - `notification_tasks.py:53` lê `opp.get("expected_value", 0)` → sempre 0 → filtro `>= min_opportunity_value` nunca recorta por valor.
   - `notification_service.py:58-60` lê `customer_name`/`expected_value`/`days_inactive` → emails/WhatsApp saem com "Cliente", R$ 0,00 e 0 dias.
   - `carteira.py:68` lê `customerHash` (correto). Inconsistência interna entre consumidores.

3. **[doc] CLAUDE.md não é fonte confiável:** validators "vazio" (falso), notificações/ingestão/carteira [PLANEJADO] (implementados), "Data Warehouse Parquet + etl_lock" (inexistente — ETL in-memory).

4. **[infra/escala]** acoplamento a arquivo temp em disco local (`files.py:44-86`, `tasks.py:22-123`): API e worker precisam compartilhar filesystem; retry depende do arquivo local persistir → quebra em hosts separados sem storage compartilhado. Ausência do `etl_lock` → `[suposição]` race de "last write wins" em uploads concorrentes da mesma empresa (`tasks.py:46-64`).

5. **[segurança, menores]** JWT 7 dias sem revogação (troca de senha não invalida tokens); signup sem validação de força de senha; enumeração de email no signup (`auth.py:88-89`); container roda como root; `/debug-sync-plan` gated só por env.

---

## Veredito da Fase 1

Produto **substancialmente mais completo** do que a doc sugere. O caminho crítico para o diferencial ("notificação diária automática com mensagem de IA") tem o esqueleto pronto (Beat + Resend/Twilio + prefs), mas está **inativo de fato** por: (a) IA inexistente, (b) bug que esvazia o conteúdo das notificações. O gargalo de ativação é integração/correção, não construção do zero.
