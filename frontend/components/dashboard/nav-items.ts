//components/dashboard/nav-items.ts
// Fonte única da navegação do dashboard — consumida pela sidebar (desktop) E
// pela bottom navigation bar (mobile). Não duplicar a lista em outro lugar.

import {
  LayoutDashboard,
  LineChart,
  Users,
  Settings,
  HelpCircle,
  Briefcase,
  Plug2,
  Send,
  CreditCard,
  Megaphone,
  Upload,
  type LucideIcon,
} from 'lucide-react'

export type Role = 'admin' | 'analyst' | 'viewer'

export type NavEntry = {
  name: string
  /** Rótulo curto para a bottom bar (cai para `name` se ausente). */
  shortName?: string
  href: string
  icon: LucideIcon
  badge: string | null
  /** roles ausente = todos os papéis têm acesso */
  roles?: Role[]
}

export const NAV_GROUPS: { label: string; items: NavEntry[] }[] = [
  {
    label: 'Operação',
    items: [
      { name: 'Visão geral', shortName: 'Início', href: '/dashboard', icon: LayoutDashboard, badge: null },
      { name: 'Carteira', href: '/dashboard/carteira', icon: Briefcase, badge: null },
      { name: 'Disparo', href: '/dashboard/disparo', icon: Send, badge: null, roles: ['admin', 'analyst'] },
      { name: 'Campanhas', href: '/dashboard/campanhas', icon: Megaphone, badge: null, roles: ['admin', 'analyst'] },
    ],
  },
  {
    label: 'Análise',
    items: [
      { name: 'Insights', href: '/dashboard/insights', icon: LineChart, badge: null },
    ],
  },
  {
    label: 'Conta',
    items: [
      { name: 'Equipe', href: '/dashboard/team', icon: Users, badge: null, roles: ['admin'] },
      { name: 'Integrações', href: '/dashboard/integrations', icon: Plug2, badge: null, roles: ['admin'] },
      { name: 'Faturamento', href: '/dashboard/billing', icon: CreditCard, badge: null, roles: ['admin'] },
      { name: 'Configurações', href: '/dashboard/settings', icon: Settings, badge: null },
    ],
  },
]

export const SECONDARY_NAV: { name: string; href: string; icon: LucideIcon }[] = [
  { name: 'Ajuda', href: '/dashboard/help', icon: HelpCircle },
]

// ─── Derivações para a bottom bar (mobile) ────────────────────────────────────
// Mesma fonte: os itens vêm de NAV_GROUPS, sem redigitar nomes/ícones/rotas.

const ALL_ITEMS = NAV_GROUPS.flatMap((g) => g.items)

/** Os 4 destinos de uso diário do vendedor (o 5º slot é o botão "Mais"). */
const PRIMARY_HREFS = ['/dashboard', '/dashboard/carteira', '/dashboard/disparo', '/dashboard/insights']

export const BOTTOM_NAV_PRIMARY: NavEntry[] = PRIMARY_HREFS.map(
  (href) => ALL_ITEMS.find((i) => i.href === href)!,
)

/** Tudo que não está na barra principal vai para o drawer "Mais" (nada fica inacessível no mobile). */
export const MORE_NAV_ITEMS: NavEntry[] = [
  // "Importar" é ação primária, mas o botão do header é hidden no mobile (sm:inline-flex).
  // Incluímos aqui para que o upload seja alcançável no celular pelo drawer (sem depender do ⌘K).
  { name: 'Importar', shortName: 'Importar', href: '/dashboard/upload', icon: Upload, badge: null, roles: ['admin', 'analyst'] },
  ...ALL_ITEMS.filter((i) => !PRIMARY_HREFS.includes(i.href)),
  ...SECONDARY_NAV.map((s) => ({ ...s, badge: null })),
]

export function navLabel(item: NavEntry): string {
  return item.shortName ?? item.name
}
