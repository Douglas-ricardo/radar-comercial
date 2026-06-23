# Auditoria de Produto & Mercado — Radar Comercial

> Sumário executivo. Auditoria conduzida em `2026-06-16`, confiando no código (não no CLAUDE.md). Análise crítica, não validação.

## Os 3 achados mais críticos

**1. O produto está mais construído do que a doc diz — mas o diferencial está quebrado, não ausente.**
Ingestão por API Key, notificações (Resend+Twilio), Carteira Ativa e reset de senha **já existem e estão ligados a backend** (CLAUDE.md os marca como `[PLANEJADO]`). Porém o diferencial central — a notificação diária — **dispara conteúdo vazio** ("Cliente / R$ 0,00 / 0 dias") por um bug de chave camelCase↔snake_case, e a "mensagem por IA" não tem uma linha de código. O motor existe; não gira.

**2. Paradoxo de ingestão: a automação depende de dado fresco que a PME-alvo não fornece sozinha.**
O cliente (PME-BR que vive de ERP e planilha) só consegue alimentar o sistema por **upload manual de CSV**. O conector de ERP que fecharia o ciclo está na **última etapa** do roadmap. Notificação *diária* sobre uma base que congela entre uploads vira ruído → churn no mês 1-2. É defeito de sequenciamento: o combustível (ingestão) foi posto depois do motor (push).

**3. Heurística rasa + divergências entre doc e código minam a confiança.**
"Oportunidade qualificada" hoje é `valor/2` com `produto` e `frequência` hardcoded; churn é medido contra a data do *arquivo*, não contra hoje. A cobrança real é flat por tier (`quantity:1`), não "por usuário" como vendido. O "Data Warehouse Parquet + lock" descrito não existe (ETL roda em memória).

## Veredito direto

**Está pronto para produção? Não.** Está pronto para **demo controlada**, e essa é exatamente a armadilha — em demo com CSV fresco ele parece cumprir a promessa, mascarando que no uso real não se sustenta.

**Mínimo absoluto para um MVP vendável** (a maior parte é correção, não construção):
1. Corrigir o bug que esvazia as notificações.
2. Churn relativo a hoje, não ao arquivo.
3. Corrigir o `KeyError` do ranking (`analyst`).
4. Implementar a IA de mensagem (única peça realmente nova).
5. Qualificação real de oportunidade (dados já existem, só não são usados).

**Para reter, não só vender:** resolver ingestão automática (conector Sheets/ERP) **antes** de polir a IA. Sem isso, o produto se auto-prova inútil rápido.

A boa notícia: o trabalho pesado de engenharia em grande parte está feito. O gap é **correção + sequenciamento + a camada de IA**, não reconstrução.

## Os 6 arquivos

| # | Arquivo | Conteúdo |
|---|---|---|
| 0 | [00-inventario.md](00-inventario.md) | Tabela mestre: feature → estado real → evidência |
| 1 | [01-realidade-vs-intencao.md](01-realidade-vs-intencao.md) | O que entrega hoje vs. o pitch; gap mínimo do MVP |
| 2 | [02-ponto-fraco.md](02-ponto-fraco.md) | O paradoxo de ingestão e o custo do sequenciamento |
| 3 | [03-mercado.md](03-mercado.md) | Concorrência BR + internacional; filtro adaptar/descartar |
| 4 | [04-falhas.md](04-falhas.md) | Falhas por severidade: produto + técnico |
| 5 | [05-roadmap.md](05-roadmap.md) | Crítica da ordem e roadmap reordenado por impacto/esforço |
