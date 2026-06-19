//components/dashboard/sidebar.tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Logo } from '@/components/common/logo'
import { useAuth } from '@/lib/auth/auth-context'
import { api } from '@/lib/api/client'
import {
  LayoutDashboard,
  LineChart,
  Users,
  Settings,
  HelpCircle,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Crown,
  Briefcase,
  Plug2,
  Send,
  CreditCard,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useState, useEffect } from 'react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

type NavEntry = { name: string; href: string; icon: LucideIcon; badge: string | null }

// Agrupada por intenção: o loop diário (Operação) no topo; análise no meio; conta embaixo.
const NAV_GROUPS: { label: string; items: NavEntry[] }[] = [
  {
    label: 'Operação',
    items: [
      { name: 'Visão geral', href: '/dashboard', icon: LayoutDashboard, badge: null },
      { name: 'Carteira', href: '/dashboard/carteira', icon: Briefcase, badge: null },
      { name: 'Disparo', href: '/dashboard/disparo', icon: Send, badge: 'novo' },
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
      { name: 'Equipe', href: '/dashboard/team', icon: Users, badge: null },
      { name: 'Integrações', href: '/dashboard/integrations', icon: Plug2, badge: null },
      { name: 'Faturamento', href: '/dashboard/billing', icon: CreditCard, badge: null },
      { name: 'Configurações', href: '/dashboard/settings', icon: Settings, badge: null },
    ],
  },
]

const secondaryNavigation: { name: string; href: string; icon: LucideIcon }[] = [
  { name: 'Ajuda', href: '/dashboard/help', icon: HelpCircle },
]

interface NavItemProps {
  item: NavEntry
  collapsed: boolean
}

function NavItem({ item, collapsed }: NavItemProps) {
  const pathname = usePathname()
  const isActive =
    pathname === item.href ||
    (item.href !== '/dashboard' && pathname.startsWith(`${item.href}/`))

  const content = (
    <Link
      href={item.href}
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
        isActive
          ? 'bg-accent font-semibold text-accent-foreground'
          : 'font-medium text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground',
        collapsed && 'justify-center px-2'
      )}
    >
      <item.icon
        className={cn(
          'h-[18px] w-[18px] shrink-0',
          isActive ? 'text-primary' : 'text-muted-foreground'
        )}
        aria-hidden="true"
      />
      {!collapsed && (
        <>
          <span>{item.name}</span>
          {item.badge && (
            <span className="ml-auto rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              {item.badge}
            </span>
          )}
        </>
      )}
      {isActive && (
        <span
          className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-primary"
          aria-hidden="true"
        />
      )}
    </Link>
  )

  if (collapsed) {
    return (
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>{content}</TooltipTrigger>
        <TooltipContent side="right" className="flex items-center gap-2">
          {item.name}
          {item.badge && (
            <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-xs text-primary">
              {item.badge}
            </span>
          )}
        </TooltipContent>
      </Tooltip>
    )
  }

  return content
}

export function DashboardSidebar() {
  const { company } = useAuth()
  const [collapsed, setCollapsed] = useState(false)
  const [toContact, setToContact] = useState(0)

  // Badge "a contatar" na Carteira — uma leitura leve por sessão de navegação
  useEffect(() => {
    if (!company?.id) return
    let active = true
    api.carteira
      .list(company.id)
      .then((res) => {
        if (active && res.success && res.data) {
          setToContact(res.data.filter((o) => o.action.status === 'to_contact').length)
        }
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [company?.id])

  const usagePercentage = company
    ? Math.min((company.uploadsUsed / company.uploadsLimit) * 100, 100)
    : 0
  const isNearLimit = usagePercentage > 80

  return (
    <TooltipProvider>
      <aside
        className={cn(
          'flex h-screen flex-col border-r border-sidebar-border bg-sidebar transition-all duration-300',
          collapsed ? 'w-16' : 'w-64'
        )}
        aria-label="Navegação principal"
      >
        {/* Logo */}
        <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-4">
          <Link href="/dashboard" aria-label="Radar Comercial — Início">
            <Logo showText={!collapsed} size="sm" />
          </Link>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-sidebar-foreground hover:bg-sidebar-accent"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
            aria-expanded={!collapsed}
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            ) : (
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            )}
          </Button>
        </div>

        {/* Navegação principal — agrupada por intenção */}
        <nav className="flex-1 space-y-5 overflow-y-auto px-2 py-4" aria-label="Menu">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="space-y-1">
              {!collapsed && (
                <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                  {group.label}
                </p>
              )}
              {group.items.map((item) => (
                <NavItem
                  key={item.name}
                  item={
                    item.href === '/dashboard/carteira' && toContact > 0
                      ? { ...item, badge: String(toContact) }
                      : item
                  }
                  collapsed={collapsed}
                />
              ))}
            </div>
          ))}
        </nav>

        {/* Indicador de uso — expandido */}
        {!collapsed && company && (
          <div className="mx-3 mb-4 rounded-lg border border-sidebar-border bg-sidebar-accent/40 p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-medium text-sidebar-foreground">Uploads</span>
              <span
                className={cn(
                  'text-xs font-semibold tabular-nums',
                  isNearLimit ? 'text-destructive' : 'text-sidebar-foreground'
                )}
              >
                {company.uploadsUsed}/{company.uploadsLimit}
              </span>
            </div>
            <div
              className="h-2 overflow-hidden rounded-full bg-sidebar-border"
              role="progressbar"
              aria-valuenow={Math.round(usagePercentage)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${company.uploadsUsed} de ${company.uploadsLimit} uploads utilizados`}
            >
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-500',
                  isNearLimit ? 'bg-destructive' : 'bg-primary'
                )}
                style={{ width: `${usagePercentage}%` }}
              />
            </div>
            <div className="mt-3 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Crown className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                <span className="text-xs text-muted-foreground">
                  Plano {company.plan.charAt(0).toUpperCase() + company.plan.slice(1)}
                </span>
              </div>
              {isNearLimit && (
                <Link
                  href="/dashboard/settings?tab=billing"
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Upgrade
                </Link>
              )}
            </div>
          </div>
        )}

        {/* Indicador de uso — recolhido */}
        {collapsed && company && (
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <div className="mx-2 mb-4 flex justify-center">
                <div
                  className={cn(
                    'flex h-10 w-10 items-center justify-center rounded-lg',
                    isNearLimit ? 'bg-destructive/10' : 'bg-primary/10'
                  )}
                  role="status"
                  aria-label={`${company.uploadsUsed} de ${company.uploadsLimit} uploads`}
                >
                  <Sparkles
                    className={cn(
                      'h-5 w-5',
                      isNearLimit ? 'text-destructive' : 'text-primary'
                    )}
                    aria-hidden="true"
                  />
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent side="right">
              <p className="font-medium">
                {company.uploadsUsed}/{company.uploadsLimit} uploads
              </p>
              <p className="text-xs text-muted-foreground">Plano {company.plan}</p>
            </TooltipContent>
          </Tooltip>
        )}

        {/* Navegação secundária */}
        <div className="border-t border-sidebar-border px-2 py-3">
          {secondaryNavigation.map((item) => {
            const content = (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground',
                  collapsed && 'justify-center px-2'
                )}
              >
                <item.icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                {!collapsed && <span>{item.name}</span>}
              </Link>
            )

            if (collapsed) {
              return (
                <Tooltip key={item.name} delayDuration={0}>
                  <TooltipTrigger asChild>{content}</TooltipTrigger>
                  <TooltipContent side="right">{item.name}</TooltipContent>
                </Tooltip>
              )
            }

            return content
          })}
        </div>
      </aside>
    </TooltipProvider>
  )
}
