# FIX 1 — Blocker: todo upload retorna HTTP 500 (chave de log reservada)

Cole numa sessão do Claude Code na raiz do projeto. Corrija SÓ este bug nesta sessão.

## Causa raiz (confirmada por execução E2E)
`app/api/files.py:164` passa `filename` dentro de `extra={...}` num `logger.info`.
`filename` é atributo RESERVADO do `LogRecord` do Python → levanta
`KeyError: "Attempt to overwrite 'filename' in LogRecord"` de forma determinística,
em qualquer ambiente. A exceção não é tratada → o endpoint de upload devolve 500
para 100% dos uploads. Pior: o crash ocorre DEPOIS do incremento de `uploads_used`
(linha ~110) e ANTES de `process_sales_file.delay()` (linha ~192) — então cada
upload falho queima 1 da cota do plano sem processar nada.

## Tarefa
1. Em `app/api/files.py`, na linha ~164, renomeie a chave `filename` no `extra=`
   para `upload_filename` (mantenha o valor `safe_filename`). Ajuste qualquer
   consumidor de log que dependa dessa chave (improvável).

2. **Varra o projeto inteiro** por outras chaves reservadas do LogRecord em `extra=`,
   porque a convenção do CLAUDE.md (`logger.info(..., extra={...})`) propaga esse risco.
   Rode e me mostre a saída crua:
   ```
   grep -rn 'extra={' app/ | grep -iE '"(filename|module|name|message|args|levelname|levelno|pathname|lineno|funcName|created|msecs|process|processName|thread|threadName|asctime|exc_info|stack_info|taskName)"'
   ```
   Corrija TODA ocorrência (prefixe a chave, ex.: `module` → `log_module`).
   Lista completa de nomes proibidos em `extra`: filename, module, name, message,
   args, levelname, levelno, pathname, lineno, funcName, created, msecs, relativeCreated,
   process, processName, thread, threadName, asctime, exc_info, exc_text, stack_info, taskName.

3. **Trate a exceção do endpoint** para nunca mais vazar 500 cru: o handler de upload
   deve capturar exceções inesperadas, **estornar o incremento de `uploads_used`** se o
   enfileiramento falhar (senão o usuário perde cota por um erro do servidor), e retornar
   o JSON padrão `{success:false, error:"..."}` em vez de "Internal Server Error" texto puro.

4. Adicione um teste de regressão que exercita o caminho REAL (o que os 79 testes não
   faziam): via TestClient, faça signup→login→POST /files/upload de um CSV mínimo válido
   e afirme status 200 + JSON com file_id. Esse teste teria pego o bug.

## Verificação
```
.venv/bin/pytest tests/ -q          # manter verde + novo teste passando
grep -rn 'extra={' app/ | grep -iE '"(filename|module|name|message|process|thread|lineno|levelname)"'  # deve voltar VAZIO
```
Depois suba API + worker e rode o E2E (e2e/run_e2e.py). Os 5 uploads que davam 500
devem agora passar do upload. Cenários 1 e 3 (limpo/fresco) devem ir verdes ponta a
ponta — insights, oportunidades, freshness. Os cenários 2/4/5 ainda vão falhar por
COLUNA (header) — isso é o FIX 2, não toque agora.

NÃO corrija o matching de colunas nesta sessão. Só o blocker de log + tratamento de erro.
Reporte: arquivos tocados, ocorrências encontradas na varredura, e resultado do E2E.
