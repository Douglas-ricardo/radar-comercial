# 04 — Falhas (produto + técnico)

> Formato por linha: **[severidade]** falha → impacto no negócio → correção sugerida. Ordenado por severidade. Baseado nos achados da Fase 1.

## ALTA

**[ALTA] Paradoxo de ingestão: diferencial depende de dado fresco que o cliente-alvo não fornece sozinho.**
→ *Impacto:* a "notificação diária automática" não se sustenta com upload manual de CSV; churn no mês 1-2, falso PMF em demo. É a falha estrutural (ver `02`).
→ *Correção:* priorizar conector ERP/planilha (n8n, Google Sheets, ou pull agendado) **antes** de polir IA/notificações. Reordenar roadmap (ver `05`).

**[ALTA] Bug camelCase/snake_case esvazia o conteúdo das notificações.**
→ *Impacto:* o diferencial central, quando dispara, envia "Cliente / R$ 0,00 / 0 dias" — pior que não enviar (destrói confiança). E `min_opportunity_value` nunca recorta (lê `expected_value` em dict camelCase → sempre 0).
→ *Correção:* alinhar chaves entre `etl.py` (gera `customer`, `expectedValue`, `daysInactive`) e `notification_service.py:58-60` / `notification_tasks.py:53`. Adicionar teste de contrato sobre o dict de oportunidade.

**[ALTA] Churn calculado contra `max_date` do arquivo, não contra a data de hoje.**
→ *Impacto:* base congela entre uploads; "oportunidades" envelhecem sem o sistema perceber; notificação diária repete o mesmo conteúdo. Mina a credibilidade do dado.
→ *Correção:* usar `datetime.now()` (BRT) como referência de recência; ou, se o dataset é histórico, sinalizar ao usuário "dados até DD/MM" em vez de tratar como tempo real. `etl.py:144-148,191`.

**[ALTA] "Qualificação" de oportunidade é heurística hardcoded.**
→ *Impacto:* `expectedValue = valor/2`, `product = "Mix de Produtos"`, `frequency = "Mensal"`, `confidence` por limiar fixo (`etl.py:265-271`). O pitch ("oportunidade qualificada") não se sustenta sob escrutínio do cliente; vira "dashboard genérico".
→ *Correção:* computar `product`/`frequency`/`expectedValue` reais a partir do histórico já no DataFrame (último produto comprado, cadência média, ticket médio). Dados existem; só não são usados.

**[ALTA] IA de mensagem personalizada (Etapa 3) inexistente.**
→ *Impacto:* "mensagem personalizada por IA" é vendida mas não há código Anthropic. Sem ela, a notificação é template estático — não é o diferencial prometido.
→ *Correção:* implementar `POST /opportunities/{id}/generate-message` com Claude usando contexto do `CustomerProfile`. Esforço médio, alto valor percebido.

## MÉDIA

**[MÉDIA] `KeyError` no ranking da Carteira para role `analyst`.**
→ *Impacto:* `GET /api/carteira/{id}/ranking` quebra (500) para analysts; funciona só para admin. Feature de gestão comercial inutilizável para parte dos usuários.
→ *Correção:* `carteira.py:183` usar `r["userId"]` (camelCase, como montado em `:170`).

**[MÉDIA] Não-persistência de transações brutas bloqueia reprocessamento e teto de IA.**
→ *Impacto:* toda mudança de regra (churn 60→90d, novo fator de `expectedValue`) exige re-upload do cliente; sem janelas de data arbitrárias; sem drill-down; IA futura limitada a contexto agregado. Fricção de iteração de produto e teto de sofisticação. (`models.py:73-97`)
→ *Correção:* reavaliar a decisão LGPD. Opção: persistir bruto **anonimizado/pseudonimizado** em blob (S3) com retenção controlada, mantendo conformidade — habilita reprocessamento e ML real.

**[MÉDIA] Estado em disco local impede multi-instância.**
→ *Impacto:* upload grava `temp/{id}_{filename}` e o worker lê o mesmo path (`files.py:44-86`, `tasks.py:22-123`); retry depende do arquivo local. API e worker em hosts diferentes (ex.: Vercel + worker) → falha. Bloqueia escala horizontal real.
→ *Correção:* migrar para S3/blob, passar URL à task Celery em vez de path local.

**[MÉDIA] Ausência do `etl_lock` → race em uploads concorrentes da mesma empresa.**
→ *Impacto:* `[suposição]` dois uploads simultâneos fazem `delete + bulk_save` de `CustomerProfile` concorrente (`tasks.py:46-64`) → perfis inconsistentes / last-write-wins. CLAUDE.md descreve um lock que **não existe** no código.
→ *Correção:* reintroduzir lock Redis por `company_id` no início da task de processamento.

**[MÉDIA] Cobrança real (flat por tier) diverge do modelo declarado ("por usuário").**
→ *Impacto:* Stripe com `quantity:1` (`billing.py:95`) — fatura fixa por tier, não per-seat nem por upload. A tese de monetização do CLAUDE.md não está implementada; receita não escala com adoção dentro da conta.
→ *Correção:* decidir o modelo e implementá-lo (per-seat = `quantity` dinâmico + reporte de uso ao Stripe). Alinhar pricing com mercado (R$50–130/usuário, ver `03`).

**[MÉDIA] Signup sem validação de força de senha + enumeração de e-mail.**
→ *Impacto:* contas com senha fraca; `auth.py:88-89` revela se e-mail já existe (contraste com o forgot-password, que é anti-enumeração). Risco de credential stuffing.
→ *Correção:* validar `len>=8` (mín.) no signup; padronizar resposta para não enumerar.

## BAIXA

**[BAIXA] JWT 7 dias sem revogação pós-troca de senha.**
→ *Impacto:* token roubado segue válido após `change-password`/`reset` (sem `jti`/versão de credencial). `security.py:26`.
→ *Correção:* versionar credencial no payload e invalidar na troca.

**[BAIXA] Container roda como root; `uvicorn --reload` no compose.**
→ *Impacto:* superfície de ataque maior; `--reload` impróprio para produção.
→ *Correção:* `USER` não-root no Dockerfile; Gunicorn/uvicorn workers sem reload em prod.

**[BAIXA] Onboarding coleta setor/nº de funcionários sem persistir.**
→ *Impacto:* dado de segmentação/qualificação perdido; impossível usar para pricing ou CS depois.
→ *Correção:* endpoint para gravar esses campos em `Company`.

**[BAIXA] Endpoint `/debug-sync-plan` em produção (gated por env).**
→ *Impacto:* qualquer admin força sync de plano se `DEBUG_WEBHOOK=true` vazar. `billing.py:207`.
→ *Correção:* remover de builds de produção ou exigir credencial separada.

**[BAIXA] CLAUDE.md desatualizado (doc não confiável).**
→ *Impacto:* doc descreve features prontas como [PLANEJADO] e features inexistentes (Parquet/lock) como ativas; valida-se errado e onboarda-se dev errado.
→ *Correção:* sincronizar CLAUDE.md com o código real.
