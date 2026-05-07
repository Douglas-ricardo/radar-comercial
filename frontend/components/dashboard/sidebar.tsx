//components/dashboard/sidebar.tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Logo } from '@/components/common/logo'
import { useAuth } from '@/lib/auth/auth-context'
import {
  LayoutDashboard,
  Upload,
  LineChart,
  History,
  Users,
  Settings,
  HelpCircle,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Crown,
  Briefcase,
  Plug2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useState } from 'react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, badge: null },
  { name: 'Upload', href: '/dashboard/upload', icon: Upload, badge: 'novo' },
  { name: 'Insights', href: '/dashboard/insights', icon: LineChart, badge: null },
  { name: 'Carteira', href: '/dashboard/carteira', icon: Briefcase, badge: null },
  { name: 'Histórico', href: '/dashboard/history', icon: History, badge: null },
  { name: 'Equipe', href: '/dashboard/team', icon: Users, badge: null },
  { name: 'Integrações', href: '/dashboard/integrations', icon: Plug2, badge: null },
  { name: 'Configurações', href: '/dashboard/settings', icon: Settings, badge: null },
] as const

const secondaryNavigation = [
  { name: 'Ajuda', href: '/dashboard/help', icon: HelpCircle },
] as const

interface NavItemProps {
  item: (typeof navigation)[number]
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
        'group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200',
        isActive
          ? 'bg-primary text-primary-foreground shadow-sm'
          : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
        collapsed && 'justify-center px-2'
      )}
    >
      <item.icon
        className={cn(
          'h-5 w-5 shrink-0 transition-transform duration-200',
          !isActive && 'group-hover:scale-110'
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
          className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-primary-foreground/30"
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

        {/* Navegação principal */}
        <nav className="flex-1 space-y-1 px-2 py-4" aria-label="Menu">
          {navigation.map((item) => (
            <NavItem key={item.name} item={item} collapsed={collapsed} />
          ))}
        </nav>

        {/* Indicador de uso — expandido */}
        {!collapsed && company && (
          <div className="mx-3 mb-4 rounded-xl border border-sidebar-border bg-sidebar-accent/50 p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-medium text-sidebar-foreground">Uploads</span>
              <span
                className={cn(
                  'text-xs font-semibold',
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
                  isNearLimit
                    ? 'bg-gradient-to-r from-destructive to-destructive/80'
                    : 'bg-gradient-to-r from-primary to-primary/80'
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
