// Fonte única de verdade dos planos exibidos no frontend (landing, onboarding,
// billing). Mantém preço, período e features sincronizados — evita o drift em
// que cada tela listava valores/benefícios diferentes (ex.: onboarding dizia
// "/mês" em vez de "/mês por usuário" e features divergentes).
//
// Os LIMITES por plano (uploads/usuários) são governados pelo backend
// (plan_service.py) — aqui ficam apenas os rótulos de marketing/exibição.

export type PlanId = 'free' | 'pro' | 'enterprise'

export interface PlanCatalogEntry {
  id: PlanId
  name: string
  /** String de exibição já formatada, ex.: 'R$ 199'. */
  price: string
  /** Sufixo do preço, ex.: '/mês por usuário'. Vazio quando não se aplica. */
  period: string
  description: string
  features: string[]
  popular: boolean
}

export const PLAN_CATALOG: Record<PlanId, PlanCatalogEntry> = {
  free: {
    id: 'free',
    name: 'Gratuito',
    price: 'R$ 0',
    period: '/mês',
    description: 'Para começar a explorar',
    features: ['5 análises por mês', 'Insights e oportunidades', '1 usuário', 'Suporte por email'],
    popular: false,
  },
  pro: {
    id: 'pro',
    name: 'Profissional',
    price: 'R$ 199',
    period: '/mês por usuário',
    description: 'Para times em crescimento',
    features: [
      '50 análises por mês',
      'Mensagem por IA',
      'Disparo WhatsApp + e-mail',
      'Até 10 usuários',
      'Cobrança por assento',
      'Suporte prioritário',
    ],
    popular: true,
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    price: 'Sob consulta',
    period: '',
    description: 'Para grandes operações',
    features: [
      'Análises ilimitadas',
      'Usuários ilimitados',
      'Conectores de ERP',
      'Suporte dedicado',
      'API + SSO',
    ],
    popular: false,
  },
}

export const PLAN_LIST: PlanCatalogEntry[] = [
  PLAN_CATALOG.free,
  PLAN_CATALOG.pro,
  PLAN_CATALOG.enterprise,
]
