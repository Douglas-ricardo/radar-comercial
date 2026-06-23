# 05 — Crítica do roadmap e ordem recomendada

> O projeto propõe 5 etapas: (1) API Key → (2) Notificações → (3) IA → (4) Carteira Ativa → (5) Conectores ERP. Crítica e reordenação por impacto/esforço.

## Premissa que muda tudo: o roadmap descreve trabalho já feito

A Fase 1 mostrou que **Etapas 1, 2 e 4 já estão majoritariamente construídas** (ingestão por API Key, notificações Resend+Twilio, Carteira Ativa — todas funcionais no código, apesar de marcadas [PLANEJADO]). Só a **Etapa 3 (IA)** é greenfield, e a **Etapa 5 (conectores ERP)** é integração/documentação.

Ou seja: o roadmap publicado **não reflete o estado real**. A pergunta deixa de ser "o que construir primeiro" e passa a ser **"o que corrigir/conectar primeiro para que o que já existe realmente funcione e venda"**.

## Crítica da ordem proposta

**A ordem entrega valor cedo? Não — e pior, ela empurra o pré-requisito do diferencial para o fim.**

- A ordem é organizada por **camada técnica**, não por **valor ao cliente-alvo**. Começa pela porta de entrada genérica (API Key, que a PME não sabe usar) e termina pelo que efetivamente alimenta o produto no mundo real (conector ERP).
- O diferencial (notificação automática, Etapa 2 + IA, Etapa 3) é montado **antes** de garantir a fonte de dado que o sustenta (Etapa 5). Constrói-se o motor de push antes do combustível de ingestão. É o defeito de sequenciamento descrito em `02-ponto-fraco.md`.
- A **ingestão automática que casa com a PME-BR está fragmentada e mal posicionada**: API Key genérica na Etapa 1, conectores reais (n8n/Omie/Bling/Sheets) na Etapa 5. Nenhuma das duas chega cedo de forma utilizável pelo cliente final.

**Conclusão:** a ingestão automática **deveria vir antes** das notificações e da IA. Sem dado fresco recorrente, notificação diária e mensagem de IA são feature cara sobre fundação que não gira sozinha.

## Ordem que eu defenderia

Princípio: **primeiro fazer o que já existe funcionar de verdade (correções de alto ROI), depois garantir o combustível (ingestão), só então polir o diferencial (IA), por fim escalar.**

### Fase 0 — Correções de ativação (dias, não semanas) — ROI altíssimo
1. Bug camelCase/snake_case das notificações (sem isso o diferencial envia lixo).
2. Churn relativo a `hoje`, não ao `max_date`.
3. `KeyError` do ranking da Carteira.
4. Qualificação real de oportunidade (`product`/`frequency`/`expectedValue` computados).

> Por quê primeiro: esforço baixo, desbloqueiam features **já construídas**. Maior impacto/esforço do projeto inteiro.

### Fase 1 — Ingestão sem trabalho do cliente (o ex-Etapa 5, promovido)
5. Conector Google Sheets + 1 ERP (Omie **ou** Bling) via n8n/pull agendado, chamando o `/data/ingest` que **já existe**.
6. Agendar reprocessamento periódico (cron por empresa) para que a base se mantenha fresca → premissa da notificação diária.

> Por quê antes das notificações maduras: é o combustível. Resolve o ponto-fraco estrutural. A porta (API Key) já existe; falta o conector que a PME usa sem dev.

### Fase 2 — Diferencial completo
7. IA de mensagem (ex-Etapa 3): `generate-message` com Claude sobre `CustomerProfile`. Agora sim a notificação diária tem dado fresco (Fase 1) + conteúdo correto (Fase 0) + texto personalizado.

### Fase 3 — Monetização e gestão
8. Resolver modelo de cobrança (per-seat dinâmico vs flat) — decisão de negócio + `quantity` no Stripe.
9. Aprofundar Carteira Ativa / ranking de conversão / métrica de ROI (já parcialmente pronta).

### Fase 4 — Escala e hardening
10. S3/blob para arquivos temp + reintroduzir lock de ETL (habilita multi-instância).
11. Reavaliar persistência de bruto anonimizado (habilita reprocessamento e ML real).
12. Hardening de segurança (força de senha no signup, revogação JWT, container não-root).

## Tabela impacto/esforço (resumo)

| Item | Impacto | Esforço | Prioridade |
|---|---|---|---|
| Bug notificações vazias | Altíssimo | Baixo | 🔴 já |
| Churn vs hoje | Alto | Baixo | 🔴 já |
| Ranking KeyError | Médio | Trivial | 🔴 já |
| Qualificação real | Alto | Médio | 🔴 já |
| Conector Sheets/ERP + cron | Altíssimo | Alto | 🟠 próximo |
| IA de mensagem | Alto | Médio | 🟡 depois do combustível |
| Modelo de cobrança | Médio | Médio | 🟡 |
| S3 + lock + multi-instância | Médio (só na escala) | Alto | 🟢 quando escalar |
| Persistência bruto / ML | Médio-Alto (futuro) | Alto | 🟢 estratégico |

**Síntese:** o roadmap original inverte combustível e motor, e ignora que o motor já está (quase) construído. A ordem defensável é: **consertar o que existe → garantir ingestão fresca → completar a IA → monetizar → escalar.**
