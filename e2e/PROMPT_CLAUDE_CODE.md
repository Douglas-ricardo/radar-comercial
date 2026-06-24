# PROMPT PARA O CLAUDE CODE — Teste E2E completo do Radar Comercial

Cole tudo abaixo numa sessão do Claude Code aberta na raiz do projeto `comercial/`.

---

Você vai executar um teste end-to-end completo do Radar Comercial na minha máquina,
do zero, validando o fluxo real que um cliente PME percorre. Sou dev, não comercial —
quero saber **onde o produto quebra com dado real**, não uma demo bonita.

## Princípio inegociável
NÃO confie no CLAUDE.md nem em documentação. Confie no código e na execução real.
Se um teste passar, é porque a API respondeu certo — não porque a doc diz que deveria.
Reporte a saída crua dos comandos, não só seu resumo. Quando algo falhar, me mostre
o erro literal (stacktrace, corpo da resposta), não uma paráfrase.

## Passo 1 — Subir a stack completa
1. Leia os comandos reais de subida no CLAUDE.md e no docker-compose. Confirme as portas.
2. Verifique que o `.env` tem: DATABASE_URL, REDIS_URL, STRIPE_SECRET_KEY (sk_test_),
   e idealmente ANTHROPIC_API_KEY e RESEND_API_KEY. Liste quais estão presentes
   (sem imprimir os valores) e quais faltam — features cuja env falta vão dar WARN, não FAIL.
3. Suba, cada um em background, capturando logs em arquivos:
   - API (uvicorn)
   - **Worker Celery** — CRÍTICO. Sem o worker, todo upload fica "processing" para sempre
     e o teste vai dar timeout. Confirme no log do worker que ele registrou as tasks
     (`process_sales_file`, `send_daily_notifications`).
   - (Beat não é necessário para este teste — disparamos notificação via test-send.)
   - Frontend só se você quiser validar a UI depois; o teste de fluxo é via API.
4. Espere a API responder em `/health` (ou `/api/status`). Só prossiga quando estiver no ar.

## Passo 2 — Gerar os CSVs de teste
Coloque `generate_test_csvs.py` na raiz do backend e rode:
```
python generate_test_csvs.py test_csvs
```
Isso cria 8 arquivos em `test_csvs/`:
- `1_limpo.csv` .. `5_sujo_recuperavel.csv` → DEVEM processar com sucesso
- `6a/6b/6c` → DEVEM ser rejeitados com erro claro (não crash 500)

O cenário 5 (sujo) é o mais importante: datas misturadas, valores com R$ e vírgula,
nomes com espaço/caixa inconsistente, linhas de total/branco/zero/negativo/data-futura.
É o CSV que uma PME real manda. Se o ETL sobrevive a ele, sobrevive ao mundo.

## Passo 3 — Rodar o runner E2E
Coloque `run_e2e.py` na mesma pasta. Instale `requests` se faltar. Rode:
```
RADAR_API=http://localhost:8000/api python run_e2e.py
```
(ajuste a porta/prefixo se o seu backend usar outro — descubra no código, não chute.)

O runner faz, em sequência real, validando cada resposta:
signup → login → /me → upload de cada CSV → poll de status → insights (valida KPIs,
chaves camelCase das oportunidades, valores não-zerados, dataFreshness) → carteira
(list + ranking, onde havia o KeyError) → IA generate-message → notificação test-send →
billing checkout (Stripe test mode).

## Passo 4 — Adaptar, não desistir
Os contratos de API no runner são uma suposição informada. Se uma chamada retornar 404
ou um payload em formato diferente (ex: o campo é `id` e não `file_id`, ou a rota é
`/files/upload` com outro nome), **leia o código do endpoint real** (`app/api/*.py`,
`lib/api/client.ts`) e ajuste o runner para bater no contrato verdadeiro. Documente cada
ajuste que fizer. O objetivo é exercitar o fluxo real, não fazer o script passar à força.

## Passo 5 — Validações semânticas (além do "respondeu 200")
Para o cenário 5 (sujo), confirme manualmente lendo a resposta de insights:
- Os nomes de cliente foram normalizados? ("  PADARIA PAO QUENTE  " e "padaria pao quente"
  viraram o MESMO cliente, ou contam como dois? Se contam como dois, é bug de normalização.)
- As linhas de lixo (TOTAL GERAL, branco, valor 0, negativo, data futura) foram
  descartadas? O total de receita não deve incluir os 123.456,78 da linha "TOTAL GERAL".
- As datas nos dois formatos foram todas parseadas? (compare nº de linhas válidas vs nº de
  linhas do arquivo menos o lixo.)
Para o cenário 3 (fresco) vs 4 (defasado):
- O `dataFreshness` muda? Fresco deve indicar "live"; defasado deve indicar "até DD/MM".
  Se ambos retornam igual, o guard de freshness não está surtindo efeito no que o usuário vê.

## Passo 6 — Relatório final
Me entregue:
1. Tabela: cada etapa → PASS/FAIL/WARN + evidência (status HTTP, trecho do corpo).
2. **Os FAIL primeiro**, com o erro literal e o arquivo:linha provável da causa.
3. Os WARN separados, indicando quais são config externa ausente (Anthropic/Resend/Stripe)
   vs quais são bug real.
4. Para o cenário sujo: o veredito das validações semânticas do passo 5.
5. Sua avaliação honesta: **este produto está pronto para um comercial real usar amanhã?**
   Se não, qual é a lista MÍNIMA de correções que bloqueiam — separada de polimento que
   pode esperar.

Ao terminar, derrube os processos que você subiu (API, worker) e me diga onde ficaram os logs.

NÃO conserte bugs nesta sessão. Só diagnostique e reporte. Vou priorizar as correções
com base no seu relatório, numa sessão separada.
