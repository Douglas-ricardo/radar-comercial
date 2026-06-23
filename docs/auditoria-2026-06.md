# Auditoria de Código e Segurança — 2026-06-18

> Consolidação: varredura manual + agente de QA (read-only). Itens verificados contra o código.
> Marcação de status conforme forem corrigidos.

## 🔴 Crítico

| # | Achado | Local | Status |
|---|---|---|---|
| 1 | Ingestão por API Key **não respeita cota de plano** (burla monetização + DoS) | `integrations.py:ingest_data` | ✅ corrigido (cota + incremento atômico; testado 403) |
| 2 | Upload **não exige role** — `viewer` consome cota e dispara ETL (`require_upload_permission` existe mas não foi conectado) | `files.py` upload | ✅ corrigido (Depends require_upload_permission) |

## 🟠 Médio

| # | Achado | Local | Status |
|---|---|---|---|
| 3 | Geração de IA no disparo **sem cache** → custo Claude por cliente/dia | `outreach_service.generate_message` | ✅ corrigido (cache Redis 72h) |
| 4 | `send-now`, `generate-message`, `whatsapp/connect`, `preview` **sem rate limit** | `outreach.py`, `opportunities.py` | ✅ corrigido (@limiter em todos) |
| 5 | **Sem lock** no disparo → beat + manual concorrentes furam dedup (msg duplicada) | `outreach_tasks.run_company_outreach` | ✅ corrigido (Redis lock por empresa) |
| 6 | **N+1 query** na elegibilidade (`already_sent_today` por cliente) | `outreach_tasks._eligible_profiles` | ✅ corrigido (1 query agregada) |
| 7 | `time.sleep` bloqueia a thread do worker (não escala) | `outreach_tasks.run_company_outreach:77` | ✅ resolvido no modo cadência (P4): envio agendado via `next_run_at` em `process_cadence_steps`, sem sleep. O modo legado (disparo único) mantém sleep+lock, aceitável p/ baixo volume |
| 8 | Autorização: `whatsapp/connect`/`disconnect` **sem checar admin** (viewer conecta/desconecta) | `outreach.py` | ✅ corrigido (admin only) |
| 9 | `datetime.utcnow()` deprecado e naive em ~10 arquivos | vários | ✅ corrigido (helper `app/core/clock.py:utcnow()` → UTC naive; 31 usos trocados; testado) |
| 10 | **Sem security headers** (HSTS, nosniff, X-Frame-Options, Referrer-Policy) | `main.py` | ✅ corrigido (middleware; testado) |
| 11 | LGPD: sem opt-out do **cliente final** (STOP/link unsubscribe); opt-out não durável se cliente some do CSV | `outreach`, `tasks.py` | ✅ corrigido (tabela `ContactOptOut` durável + link de descadastro no email + endpoint público `/unsubscribe` + erase de PII; testado). Resta: resposta "PARE" via webhook Evolution → `ideias.md` P2 |
| 12 | `_count_seats` conta `pending`; convite com email falho deixa user `pending` cobrável | `billing.py`, `team.py` | ✅ resolvido por decisão de produto: **pendente É cobrado**. Comportamento atual já correto; falha de email é tratada (try/except) e o assento fica alocado intencionalmente |

## 🟡 Baixo

| # | Achado | Local | Status |
|---|---|---|---|
| 13 | `normalize_phone_br` pode gerar E.164 inválido (`len>=11` aceita qualquer coisa) | `etl.py` | ✅ corrigido (limite 11–15 dígitos; testado) |
| 14 | Ambiguidade de formato de data (`%d/%m` vs `%m/%d`) escolhida arbitrariamente | `etl.py` | ✅ corrigido (BR-first já era o default + aviso de log em empate BR×US) |
| 15 | Idempotência de webhook Stripe reprocessa se Redis cair | `billing.py` | ✅ aceito — handler de `checkout.session.completed` é idempotente por efeito (re-setar plano é inofensivo); Redis é só otimização. Não é defeito |
| 16 | `prettify_customer_name` usa `map_elements` (lento em arquivos grandes) | `etl.py` | ✅ aceito — característica de performance, não bug; irrelevante no volume PME-alvo |

## 🔎 Novos achados da varredura profunda (rodada "corrige tudo")

| # | Achado | Local | Status |
|---|---|---|---|
| 17 | `fetch_to_local` e `db` fora do `try` → se o download falha, **lock vaza e sessão não fecha** | `workers/tasks.py` | ✅ corrigido (fetch dentro do try, guarda no finally) |
| 18 | bcrypt **lança erro com senha > 72 bytes** → 500 no signup/login | `core/security.py` | ✅ corrigido (trunca 72 bytes consistente; testado) |
| 19 | `verify_password` quebra com hash malformado → 500 no login | `core/security.py` | ✅ corrigido (try/except → False; testado) |

Auditados e **sem bugs**: `carteira.py`, `customers.py`, `account.py`, `team.py` (email normalizado no validator), `sync_tasks.py` (retry aninhado redundante mas funcional).

## ✅ Verificado e OK (não são bugs)

- `contact_opt_out` **é preservado** no re-upload (`tasks.py:73-92`) — agente reportou erradamente como apagado. Só o caso-limite "cliente some do CSV e volta" perde o opt-out (coberto pelo item 11).
- `evolution_client._request` síncrono roda em rota `def` (sync) e Celery — não bloqueia event loop.
- `_frequency_label` divisão protegida por `n_purchases <= 1`.
- ~~Cobertura de testes: só `test_opportunity_contract.py` (4 testes) — falta teste de isolamento multi-tenant.~~
  ✅ **Resolvido:** suíte expandida para **27 testes**:
  - `tests/conftest.py` — harness com SQLite isolado + sessão compartilhada (pool_size=1) + 2 tenants
  - `tests/test_multitenant.py` (9) — isolamento A×B em insights/customers/carteira/ranking/outreach + 401 sem cookie
  - `tests/test_security_fixes.py` (6) — viewer sem upload, cota no ingest, API key inválida/ausente, headers, connect só admin
  - `tests/test_lgpd_and_security.py` (8) — bcrypt senha longa, hash malformado, token unsubscribe, endpoint /unsubscribe, erase de PII
  - `tests/test_opportunity_contract.py` (4) — contrato camelCase do ETL
  - Rodar: `python -m pytest tests/ -q` → **27 passed**
