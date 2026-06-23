# Redesign incremental do frontend — Radar Comercial

## Contexto
SaaS B2B (Next.js 16 + TypeScript + Tailwind 4 + shadcn/ui) que mostra a PMEs
brasileiras quais clientes pararam de comprar e quanto valem. Reformular o
frontend inteiro — a UI atual não tem cara de produto premium/confiável.
Faremos POR PARTES, com aprovação minha entre cada fase.

## Antes de tudo
1. Leia /mnt/skills/public/frontend-design/SKILL.md — uso obrigatório.
2. Mapeie o frontend inteiro: app/, components/, lib/api/client.ts,
   types/index.ts, hooks/, lib/auth/. Entenda o fluxo de dados
   (client.ts → hooks → páginas) antes de propor qualquer mudança.

## Restrições inegociáveis
- NÃO alterar contratos de dados: types/index.ts e as assinaturas em
  lib/api/client.ts ficam intactos. Redesign de UI, não de API.
- NÃO editar components/ui/ (shadcn) diretamente — estender por composição.
- Manter 100% dos fluxos funcionais (auth, upload+polling, insights, carteira,
  notificações, billing). Nenhuma rota pode quebrar.
- Sem `any` no TypeScript. Rodar `npm run lint` + `npm run build` a cada tela.

---

## FASE 0 — Pesquisa de referências (use web search; entregar em texto)
Pesquise produtos REAIS em produção, não conceitos de Dribbble/Behance nem
listas genéricas de "dashboards bonitos". Critérios de filtro:
- SaaS B2B de dados/dashboard em produção (ex. a investigar: Linear, Stripe
  Dashboard, Vercel, Retool, Mixpanel, Posthog, Attio). Não landing pages.
- Priorize fontes que mostrem a UI real (docs do produto, changelogs, telas
  oficiais), não opiniões de agência.
- Quando citar uma referência, cite a fonte.

Para cada uma das 3-4 referências escolhidas, extraia CONCRETAMENTE:
- Densidade de dados: como tratam tabelas, KPIs, listas longas
- Hierarquia visual e uso de espaço em branco
- Paleta, tipografia, profundidade (sombras/bordas)
- Por que serve ao meu público: gestor de PME-BR que vem de planilha e
  desconfia de "complicado". Premium aqui = limpo e claro, não vanguarda.

## FASE 1 — Direção de design (texto + 1 componente-piloto)
1. Sistema de design concreto: tokens de cor exatos, fontes + escala,
   espaçamento, raio, sombras, estados — traduzidos para Tailwind / CSS vars.
2. Diagnóstico do que está fraco no front atual e como a nova direção resolve.
3. UM componente-piloto redesenhado como prova de conceito (card de
   oportunidade ou um KPI do dashboard).

>>> PARE AQUI. Apresente Fases 0 e 1 e aguarde minha aprovação.
>>> Não escreva nenhuma tela completa antes do meu OK.

## FASE 2 — Construção incremental (só após aprovação)
Antes da primeira tela: se houver componentes compartilhados (Card, KPIBlock,
Table, Badge etc.), redesenhe-os PRIMEIRO — senão cada tela retrabalha o mesmo.
Depois, UMA TELA POR VEZ, na ordem de impacto na venda:
1. Dashboard (overview) → 2. Insights → 3. Carteira → 4. Upload →
5. demais telas.
Regras por tela:
- Commit pequeno e isolado.
- `npm run build` + `npm run lint` verdes antes de seguir.
- Ao terminar cada tela, mostre o que mudou e espere antes da próxima.

## Critério de sucesso
Em 5 segundos o cliente entende: "isto me diz quais clientes sumiram e quanto
valem". Clareza e confiança acima de efeito visual.