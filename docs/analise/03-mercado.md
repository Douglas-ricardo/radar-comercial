# 03 — Mercado e concorrência

> Concorrência nacional e internacional, com filtro de adaptação ao contexto PME-BR. Cada ideia internacional é classificada em **ADAPTAR** ou **DESCARTAR**, com justificativa por incompatibilidade de contexto.

## Onde o Radar se posiciona

O Radar **não é um CRM**. É uma camada de *analytics de recuperação de receita* sobre histórico de vendas. Isso é, ao mesmo tempo, seu diferencial e sua armadilha: quase todo concorrente nacional é um **CRM que já tem analytics embutido**, e o cliente-alvo da PME-BR tende a comprar *um* sistema, não dois. O Radar precisa ou (a) ser tão barato/complementar que coexiste com a planilha, ou (b) competir de frente com o módulo de relatórios do CRM que o cliente talvez já tenha.

---

## Concorrência nacional

### Agendor
- **Posicionamento:** CRM para vendas consultivas B2B, mobile-first, forte com PME que vende por WhatsApp.
- **Cobrança:** por usuário/mês, a partir de ~R$59/usuário (trial 7 dias). [fonte]
- **Força:** simplicidade e preço de entrada baixo; "guia preditivo" e gestão de funil acessíveis para PME pouco madura.
- **Fraqueza:** é CRM de funil — depende de o vendedor **registrar** as negociações manualmente. Não gera "oportunidade de recuperação" a partir do histórico de vendas/ERP automaticamente.

### RD Station CRM
- **Posicionamento:** CRM do maior ecossistema de marketing/vendas BR; plano Free robusto (até 4 usuários) como funil de aquisição.
- **Cobrança:** Free; Basic ~R$73/usuário/mês; Pro ~R$131/usuário/mês; Advanced sob consulta. [fonte]
- **Força:** marca, ecossistema (marketing + CRM), previsibilidade de resultados e Free que captura PME cedo.
- **Fraqueza:** o valor real exige a suíte paga e dado bem preenchido no funil; é pesado para o microempresário que só quer "quem parou de comprar".

### Ploomes
- **Posicionamento:** CRM para empresas com processo de vendas complexo, **50–500 funcionários, faturamento R$16–500M** — ou seja, *acima* da PME-alvo do Radar.
- **Cobrança:** por usuário/mês (planos em ploomes.com/precos), CPQ e configuração avançada. [fonte]
- **Força:** robustez, CPQ, integrações; nota alta de avaliação (4.8, 1.5k reviews).
- **Fraqueza:** complexo e caro demais para a micro/pequena empresa; over-engineered para quem só tem planilha de vendas.

### PipeRun
- **Posicionamento:** CRM "de vendedor para vendedor", 100% BR, pagamento em reais, foco em custo-benefício para PME.
- **Cobrança:** por usuário/mês, preço atrativo para pequeno/médio porte. [fonte]
- **Força:** nacional, barato, processo de vendas + pré-vendas; forte fit cultural PME-BR.
- **Fraqueza:** ainda é CRM de funil; o motor de "receita perdida / cliente inativo qualificado com valor esperado" não é o core.

**Leitura competitiva nacional:** todos cobram **por usuário** (validando a tese de monetização do Radar) e **todos pressupõem que o vendedor alimenta o funil**. Aí está a brecha real do Radar: ele promete insight *sem exigir registro manual de pipeline*, partindo do dado de vendas que já existe. Mas essa brecha só é real **se o Radar resolver a ingestão do ERP/planilha** — senão ele recai no mesmo pecado (exigir input manual, via upload de CSV). Ver `02-ponto-fraco.md`.

---

## Concorrência internacional (revenue intelligence / churn)

### Gong
- **Posicionamento:** revenue intelligence via *conversation intelligence* — grava e analisa calls/e-mails, detecta risco de churn em deals.
- **Cobrança:** enterprise, por usuário + contrato anual alto (dezenas de milhares de USD/ano). [fonte]
- **Força:** análise de interação real (sinal riquíssimo), coaching de time.
- **Fraqueza:** caríssimo; exige volume de calls gravadas e maturidade de operação de vendas.

### Clari
- **Posicionamento:** revenue platform — forecasting, inspeção de pipeline, visibilidade para liderança de receita.
- **Cobrança:** ~US$90–160/usuário/mês, contrato mínimo frequentemente US$40k–75k+/ano. [fonte]
- **Força:** previsão de receita e disciplina de pipeline de nível enterprise.
- **Fraqueza:** preço e complexidade incompatíveis com PME; assume CRM maduro e RevOps dedicado.

### (Categoria) Customer success / churn prediction (ex.: Gainsight, ChurnZero)
- **Posicionamento:** previsão de churn e health score para SaaS B2B com base instalada recorrente.
- **Cobrança:** enterprise/mid-market, anual.
- **Força:** modelos de health score e playbooks de retenção.
- **Fraqueza:** desenhados para receita recorrente (SaaS), não para venda transacional de PME que vende produto avulso.

---

## Filtro: ADAPTAR ou DESCARTAR cada ideia internacional

Critério de descarte (do enunciado): assume CRM pré-existente que a PME-alvo não tem; depende de dado estruturado que o cliente não fornece; preço incompatível com PME-BR.

| Ideia internacional | Veredito | Justificativa |
|---|---|---|
| **Detecção de risco de churn antes de acontecer** (Gong) | **ADAPTAR** | É exatamente o core do Radar — só que via *histórico de compra* (dado que a PME tem), não via análise de calls (que ela não grava). Adaptar a fonte, manter a ideia. |
| **Conversation intelligence** (gravar/analisar calls) | **DESCARTAR** | PME-BR vende por WhatsApp e telefone informal; não há infra de gravação nem volume. Depende de dado que o cliente não fornece. |
| **Forecasting de pipeline** (Clari) | **DESCARTAR** | Assume CRM maduro com pipeline preenchido e RevOps. A PME-alvo não tem pipeline estruturado — ela tem histórico de notas/vendas. Incompatível com o contexto. |
| **Health score / playbooks de retenção** (Gainsight/ChurnZero) | **ADAPTAR (versão enxuta)** | A ideia de "score de saúde do cliente" mapeia bem ao RFV que o Radar já calcula. Adaptar como segmento RFV + alerta simples; descartar o aparato de CS enterprise. |
| **Cobrança per-seat + contrato anual alto** | **DESCARTAR** | Per-seat sim (valida a tese), mas o ticket enterprise (US$40k+/ano) é inviável. Preço tem de ser PME-BR (faixa R$50–130/usuário, como Agendor/RD). |
| **Mensagem de win-back gerada por IA** (sugestão de ação) | **ADAPTAR** | Forte fit: é a Etapa 3 do Radar. Gerar texto pt-BR pronto para WhatsApp é mais valioso na PME-BR do que no enterprise (lá há SDR; aqui o dono faz tudo). |

---

## Conclusão de mercado

O Radar ocupa um espaço **legítimo e pouco atendido**: "recuperação de cliente inativo qualificada por valor, sem exigir CRM maduro". Nenhum player nacional ataca isso diretamente — todos são CRMs de funil que exigem registro manual; os internacionais que fazem isso bem são enterprise e caros.

**Mas a defensabilidade depende de duas coisas que o produto ainda não cravou:**
1. **Ingestão sem trabalho do cliente** (ERP/planilha automático) — senão o Radar é "mais um sistema para alimentar", e perde para o módulo de relatórios do CRM que o cliente já paga.
2. **Não virar CRM.** A tentação de adicionar funil/pipeline o coloca de frente com Agendor/RD/PipeRun em preço e maturidade — briga que ele perde. O posicionamento vencedor é **complemento barato que cospe ação** ("quem ligar hoje e o que dizer"), não substituto de CRM.

### Fontes
- [Agendor — Planos e preços](https://www.agendor.com.br/planos-precos)
- [Agendor — site](https://www.agendor.com.br/)
- [RD Station CRM — Planos e Preços](https://www.rdstation.com/planos/crm/)
- [RD Station CRM — Gratuito](https://www.rdstation.com/planos/crm/gratuito/)
- [Ploomes — Preços](https://www.ploomes.com/precos)
- [Comparação Ploomes vs PipeRun (B2B Stack)](https://www.b2bstack.com.br/compare/ploomes-vs-piperun-crm)
- [PipeRun CRM](https://crmpiperun.com/)
- [Clari vs Gong (forecastio.ai)](https://forecastio.ai/blog/clari-vs-gong)
- [Gong vs Clari (sybill.ai)](https://www.sybill.ai/blogs/gong-vs-clari)
- [Best Revenue Intelligence Platforms 2026 (Tellius)](https://www.tellius.com/resources/blog/best-revenue-intelligence-platforms-in-2026-clari-gong-tellius-7-more-compared)
