//components/dashboard/bottom-nav.tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import { MoreHorizontal } from 'lucide-react'

import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/auth/auth-context'
import { api } from '@/lib/api/client'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import {
  BOTTOM_NAV_PRIMARY,
  MORE_NAV_ITEMS,
  navLabel,
  type NavEntry,
  type Role,
} from '@/components/dashboard/nav-items'

function isActive(pathname: string, href: string): boolean {
  return pathname === href || (href !== '/dashboard' && pathname.startsWith(`${href}/`))
}

/**
 * Navegação primária do mobile: bottom tabs fixas (padrão de app nativo — alcance
 * do polegar). Só aparece abaixo de `md:`; no desktop a sidebar assume.
 */
export function BottomNav() {
  const { company, user } = useAuth()
  const userRole = (user?.role ?? 'viewer') as Role
  const pathname = usePathname()
  const [toContact, setToContact] = useState(0)
  const [moreOpen, setMoreOpen] = useState(false)

  const visible = (item: NavEntry) => !item.roles || item.roles.includes(userRole)
  const primary = BOTTOM_NAV_PRIMARY.filter(visible)
  const more = MORE_NAV_ITEMS.filter(visible)
  const moreActive = more.some((i) => isActive(pathname, i.href))

  // Badge "a contatar" na Carteira — leitura leve, espelha a sidebar.
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

  // Fecha o drawer ao navegar
  useEffect(() => {
    setMoreOpen(false)
  }, [pathname])

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Navegação principal"
    >
      <ul className="flex items-stretch">
        {primary.map((item) => {
          const active = isActive(pathname, item.href)
          const badge = item.href === '/dashboard/carteira' && toContact > 0 ? String(toContact) : null
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative flex min-h-[3.5rem] flex-col items-center justify-center gap-1 px-1 py-2 text-[11px] font-medium transition-colors',
                  active ? 'text-primary' : 'text-muted-foreground',
                )}
              >
                <span className="relative">
                  <item.icon className="h-[22px] w-[22px]" aria-hidden="true" />
                  {badge && (
                    <span
                      className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-none text-primary-foreground"
                      aria-hidden="true"
                    >
                      {badge}
                    </span>
                  )}
                </span>
                <span className="leading-none">{navLabel(item)}</span>
              </Link>
            </li>
          )
        })}

        {/* Slot "Mais" — abre o drawer com os destinos de conta */}
        <li className="flex-1">
          <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
            <SheetTrigger
              className={cn(
                'relative flex min-h-[3.5rem] w-full flex-col items-center justify-center gap-1 px-1 py-2 text-[11px] font-medium transition-colors',
                moreActive ? 'text-primary' : 'text-muted-foreground',
              )}
              aria-label="Mais opções"
            >
              <MoreHorizontal className="h-[22px] w-[22px]" aria-hidden="true" />
              <span className="leading-none">Mais</span>
            </SheetTrigger>
            <SheetContent side="bottom" className="rounded-t-2xl pb-[calc(env(safe-area-inset-bottom)+1rem)]">
              <SheetHeader className="text-left">
                <SheetTitle>Mais</SheetTitle>
              </SheetHeader>
              <ul className="grid gap-1 px-4 pb-2">
                {more.map((item) => {
                  const active = isActive(pathname, item.href)
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={active ? 'page' : undefined}
                        className={cn(
                          'flex min-h-[3rem] items-center gap-3 rounded-lg px-3 text-sm transition-colors',
                          active
                            ? 'bg-accent font-semibold text-accent-foreground'
                            : 'font-medium text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                        )}
                      >
                        <item.icon
                          className={cn('h-5 w-5 shrink-0', active ? 'text-primary' : 'text-muted-foreground')}
                          aria-hidden="true"
                        />
                        {item.name}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </SheetContent>
          </Sheet>
        </li>
      </ul>
    </nav>
  )
}
