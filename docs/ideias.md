# Ideias e Roadmap de Evolução — Radar Comercial

> Backlog de features e melhorias levantadas em análise especializada (2026-06-18).
> Foco: backend e segurança. O frontend será repensado depois (fora de escopo agora).
> **Status:** ideias, não implementado. Priorizar após corrigir o que já existe.

---

## 🧭 Tese central (onde está o moat)

O frontend é descartável. O diferencial defensável do produto é a **camada de dados + o loop fechado**:
provar, em reais, que o cliente voltou a comprar por causa do disparo. Toda feature abaixo é
avaliada por quanto reforça essa tese.

---

## ✅ Prioridade 1 — Loop fechado de receita recuperada — IMPLEMENTADO (2026-06-18)

**Problema (resolvido):** enviávamos a mensagem e marcávamos "contacted", sem saber se funcionou.

**Como ficou:**
- Modelo `OutreachAttribution`: snapshot no contato (`last_purchase_at_contact`, `revenue_at_contact`) + status `pending`/`recovered`/`expired` + `recovered_value`.
- No disparo bem-sucedido (`outreach_service._open_attribution`), abre atribuição pendente (idempotente por cliente).
- No próximo upload, o ETL chama `resolve_attributions`: se a última compra avançou para depois do contato (dentro da janela de **30 dias**), marca `recovered` com valor = `nova_receita − receita_no_contato`. Passou a janela sem compra → `expired`.
- **Funciona só com agregados** — não viola a decisão de não persistir transações brutas (LGPD).
- Endpoint `GET /api/outreach/recovery` (total, por canal, recentes) + card "Receita recuperada" na página `/dashboard/disparo`.
- Testes: `tests/test_recovery.py` (recovered, expired, compra anterior não conta, endpoint agrega).

**Evoluções futuras:** janela configurável por empresa; ranking de ROI por vendedor; atribuição ponderada por canal.

---

## ✅ Prioridade 2 — Recebimento de respostas + opt-out automático — IMPLEMENTADO (2026-06-18)

**Como ficou:**
- `evolution_client.set_webhook` registra o webhook da instância no connect (eventos MESSAGES_UPSERT).
- Endpoint público `POST /api/outreach/webhook/evolution?token=…` — token JWT assinado (`core/webhook_sign.py`) identifica a empresa; sempre retorna 200 (Evolution não re-tenta em loop).
- `process_inbound_reply`: acha o cliente pelo telefone, registra a resposta (`OutreachLog channel=whatsapp_in`), e se a mensagem for "PARE/SAIR/STOP/CANCELAR/…" (`is_stop_message`) → **opt-out durável automático** (`source=reply_stop`).
- Ignora mensagens nossas (`fromMe`) e grupos.
- KPI: contagem de "respostas recebidas" no card da página de Disparo (`repliesCount` no `/recovery`).
- Testes: `tests/test_webhook_replies.py` (detecção STOP, token, opt-out, ignora fromMe).

**Evolução futura:** caixa de entrada de respostas para o vendedor responder; classificação interessado/não.

---

## ✅ Prioridade 3 — Churn preditivo — IMPLEMENTADO (2026-06-18)

**Como ficou:**
- `ml/churn.py` (o `ml/` agora tem propósito — stubs vazios removidos): `assess_churn_risk(recency, avg_interval, frequency)` → risco none/low/medium/high + score 0–100 + dias de atraso.
- Heurística: cliente com ≥3 compras, ainda ativo (recência ≤60d), mas atrasado vs. o próprio intervalo médio (ratio recência/intervalo ≥1.0 low, ≥1.2 medium, ≥1.5 high).
- ETL calcula `avg_interval_days` (a partir de primeira/última compra + frequência) e grava `churn_risk`/`churn_score` no `CustomerProfile`.
- Endpoint `GET /api/insights/{id}/churn-risk` (lista + contagem por nível) + card "Clientes prestes a sumir" na página de Disparo.
- Testes: `tests/test_churn_prediction.py` (heurística overdue→high, em-dia→none, histórico insuficiente→none, já churned→none, ETL produz risco, endpoint + cross-tenant).

**Evolução futura:** incluir alto risco no alvo do disparo automático (retenção proativa); ML real (`ml/train.py`) quando houver volume de dados rotulados.

---

## ✅ Prioridade 4 — Cadência multi-toque — IMPLEMENTADO (2026-06-18)

**Como ficou:**
- Modelo `CadenceEnrollment` (máquina de estados por cliente: step_index, status, next_run_at).
- Sequência padrão `DEFAULT_CADENCE`: dia 0 WhatsApp → dia 3 e-mail → dia 7 follow-up WhatsApp (canal indisponível p/ o cliente é pulado).
- `OutreachConfig.cadence_enabled`: no modo cadência o daily run **inscreve** (não envia inline).
- Beat `process_cadence_steps` (a cada 15 min) processa passos vencidos — **DB-driven, sem `time.sleep`** (resolve o #7 da auditoria). Espaçamento vem do `next_run_at`.
- **Para sozinha** se: cliente respondeu (`replied`), comprou (`recovered`) ou opt-out (`opted_out`).
- Envio refatorado em `_do_whatsapp`/`_do_email` reutilizáveis (disparo único e cadência).
- Toggle "Cadência multi-toque" na página de Disparo.
- Testes: `tests/test_cadence.py` (enroll, não-duplica, avança+agenda, para em opt-out/resposta, daily run inscreve).

**Evolução futura:** cadência configurável por empresa (passos/dias/canais); variação de mensagem por passo.

---

## 🔵 Prioridade 5 — LGPD como feature (não só obrigação)

- Link de descadastro em todo email (legalmente exigido)
- Endpoint de exclusão/portabilidade de dados (DSAR)
- Registro de consentimento + base legal documentada
- Retenção e (futuramente) criptografia em repouso de PII
- Vira diferencial de venda para clientes maiores.

---

## 🔧 Melhorias de plataforma (transversais)

- **Observabilidade:** Sentry (erros) + métricas estruturadas + tracing.
- **Confiabilidade de jobs:** idempotency keys nos disparos (dedup atômico), visibilidade de dead-letter.
- **Webhooks de saída:** avisar ferramentas do vendedor (ex.: cliente respondeu).
- **Cobertura de testes:** especialmente isolamento multi-tenant (empresa A não lê dado de B).

---

## ✂️ Candidatos a remoção / simplificação

- `ml/` — stubs vazios de 0 byte; apagar (a doc já diz "use Claude").
- `backend/venv` E `backend/.venv` — dois virtualenvs; manter um só.
- Gráficos de sazonalidade / product gaps — métrica de vaidade? Validar se o usuário age sobre eles.
- Hardening prematuro (R2 multi-instância) — não remover, mas parar de investir antes do PMF.

---

## 💡 Ideias adicionais surgidas durante a auditoria de código

> (seção viva — preenchida conforme a varredura de bugs revela oportunidades)

- **Guardrails de custo de IA:** teto de gasto por empresa/mês com Claude + cache obrigatório
  em TODA geração de mensagem (o disparo hoje gera sem cache → custo por cliente por dia).
- **Agendamento de envios via Celery `countdown` em vez de `time.sleep`:** o disparo atual
  bloqueia a thread do worker dormindo entre mensagens (até ~minutos por empresa). Reagendar
  cada envio como task individual com atraso escalonado libera o worker e escala melhor.
- **Idempotência/lock por empresa no disparo:** existe lock de ETL, mas não de outreach. Dois
  gatilhos concorrentes (beat duplicado + envio manual) podem furar o dedup (não-atômico).
  Idempotency key por (company, customer, dia) resolveria de forma robusta.
- **Status de conexão do WhatsApp em tempo real:** hoje o disparo confia no `whatsapp_status`
  salvo no banco (pode estar defasado). Revalidar no Evolution antes do lote, ou webhook de status.
- **Consolidar query de elegibilidade:** trocar o N+1 (`already_sent_today` por cliente) por uma
  única query agregando os hashes já enviados nas últimas 24h.
