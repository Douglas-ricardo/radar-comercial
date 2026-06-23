# 01 — Realidade vs. Intenção

> Com SÓ o que está implementado e funcional hoje (Fase 1), o produto entrega sua proposta de valor central? E qual o gap mínimo para um MVP vendável?

## A proposta de valor central, decomposta

O CLAUDE.md vende duas promessas acopladas:

1. **"Oportunidades já qualificadas com histórico real"** — insight que o HubSpot não tem nativamente.
2. **"Notificação diária automática com mensagem personalizada por IA"** — o sistema avisa o vendedor sem ele entrar (modelo *push*).

São coisas diferentes. A primeira é **analítica** (computar). A segunda é **operacional/de ativação** (entregar + agir). O produto hoje resolve a primeira bem e a segunda só no esqueleto.

## O que ENTREGA hoje (real)

✅ **Oportunidades qualificadas: SIM, com ressalvas.** O ETL computa churn, RFV, oportunidades top-15 por valor, séries temporais e product gaps a partir de CSV/XLSX (`etl.py`). É um produto analítico funcional e plugado ponta a ponta (upload → worker → insights → telas). Isso é real e demonstrável.

⚠️ **A "qualificação" é heurística rasa, não inteligência.** `expectedValue = valor_histórico / 2`, `confidence` = "high" se valor > 1000, `product` = literal "Mix de Produtos", `frequency` = literal "Mensal" (`etl.py:265-271`). Churn é "sem compra há >60 dias **relativo à data máxima do arquivo**", não à data de hoje (`etl.py:144-148,191`) — então um CSV antigo gera "oportunidades" que já podem estar mortas. O cliente percebe isso na primeira semana de uso.

❌ **Notificação diária automática: NÃO entrega de fato.** O motor existe (Celery Beat 11:00 UTC, Resend, Twilio, `NotificationPreference`), mas:
- O conteúdo sai **vazio** por bug de chave camelCase/snake_case: "Cliente / R$ 0,00 / 0 dias" (`notification_service.py:58-60`).
- O filtro `min_opportunity_value` **nunca recorta** porque lê `expected_value` (snake) num dict camelCase → sempre 0 (`notification_tasks.py:53`).
- A **"mensagem personalizada por IA" não existe** — zero código Anthropic. A notificação, mesmo corrigida, seria um template estático.

## Veredito

**O produto entrega metade da proposta.** A metade analítica ("oportunidades qualificadas") está de pé e é vendável como dashboard de churn/recuperação. A metade que é o **diferencial declarado** — o *push* automático com IA — está inativa: tecnicamente presente, funcionalmente quebrada e sem a camada de IA.

Hoje o Radar é um **BI de recuperação de clientes em modo *pull*** (o usuário entra e olha). Está sendo vendido como **assistente *push*** (ele te avisa). Essa lacuna entre o pitch e o que funciona é o risco número 1 de churn pós-venda — detalhada no `02-ponto-fraco.md`.

## Gap mínimo para um MVP vendável (curto e priorizado)

Ordenado por relação impacto/esforço. Os 3 primeiros são correção, não construção.

| # | Gap | Esforço | Por quê é mínimo |
|---|---|---|---|
| 1 | **Corrigir o bug camelCase/snake_case** em notification_service/tasks | Baixo (horas) | Sem isso, o diferencial dispara conteúdo vazio. É o item de maior ROI do projeto inteiro. |
| 2 | **Churn relativo a `hoje`, não ao `max_date` do arquivo** | Baixo | Sem isso, oportunidades ficam estáticas/obsoletas — o cliente perde confiança no dado. |
| 3 | **Corrigir o `KeyError` do ranking para `analyst`** (`carteira.py:183`) | Trivial | Quebra um endpoint inteiro para um papel de usuário. |
| 4 | **IA de mensagem (Etapa 3)** — gerar texto pt-BR por oportunidade via Claude | Médio | É o que torna a notificação "personalizada" em vez de template. Diferencial real vs. um e-mail genérico. |
| 5 | **Reduzir a heurística rasa** — calcular `product`/`frequency`/`expectedValue` reais a partir do histórico já em memória | Médio | "Qualificada" precisa significar algo. Dados já existem no DataFrame; é só computar em vez de hardcodar. |
| 6 | **Resolver ingestão de dados (ponto-fraco, ver 02)** | Alto | O MVP pode vender com upload manual, mas a retenção depende disso. Fora do "mínimo" mas é o teto de crescimento. |

**Linha de corte do MVP vendável:** itens 1–4. Com eles, o produto cumpre o que promete ("oportunidade qualificada + aviso automático com mensagem pronta") para um cliente que aceite alimentar CSV. Itens 5–6 são o que separa um MVP de um produto retentível.
