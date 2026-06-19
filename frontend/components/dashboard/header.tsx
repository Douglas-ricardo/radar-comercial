//components/dashboard/header.tsx
'use client'

import { useAuth } from '@/lib/auth/auth-context'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Bell, LogOut, Settings, User, Building2, Search, CreditCard, Upload } from 'lucide-react'
import Link from 'next/link'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { useRouter } from 'next/navigation'
import { getInitials } from '@/lib/utils'
import { CommandMenuTrigger } from '@/components/dashboard/command-menu'

interface DashboardHeaderProps {
  title?: string
  description?: string
}

// Tipagem explícita para notificações — pronta para API real
interface Notification {
  id: number
  title: string
  description: string
  time: string
  unread: boolean
}

const NOTIFICATIONS: Notification[] = []

const PLAN_LABELS: Record<string, string> = {
  free: 'Gratuito',
  pro: 'Profissional',
  enterprise: 'Enterprise',
}

export function DashboardHeader({ title, description }: DashboardHeaderProps) {
  const { user, company, logout } = useAuth()
  const router = useRouter()

  const unreadCount = NOTIFICATIONS.filter((n) => n.unread).length

  return (
    <header
      className="sticky top-0 z-10 flex h-16 items-center justify-between gap-4 border-b border-border bg-background/95 px-6 backdrop-blur supports-[backdrop-filter]:bg-background/60"
      role="banner"
    >
      {/* Skip link para teclado */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        Ir para o conteúdo principal
      </a>

      {/* Título da página */}
      <div className="min-w-0 flex-1">
        {title && (
          <h1 className="truncate font-serif text-xl tracking-[-0.01em] text-foreground">{title}</h1>
        )}
        {description && (
          <p className="truncate text-sm text-muted-foreground">{description}</p>
        )}
      </div>

      {/* ⌘K — centro, apenas desktop */}
      <div className="hidden flex-1 justify-center lg:flex">
        <CommandMenuTrigger />
      </div>

      {/* Ações à direita */}
      <div className="flex items-center gap-2">
        {/* Busca mobile (⌘K) */}
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          aria-label="Abrir busca"
          onClick={() => document.dispatchEvent(new CustomEvent('open-command-menu'))}
        >
          <Search className="h-5 w-5" aria-hidden="true" />
        </Button>

        {/* Importar — ação primária */}
        <Button asChild size="sm" className="hidden h-9 gap-2 sm:inline-flex">
          <Link href="/dashboard/upload">
            <Upload className="h-4 w-4" aria-hidden="true" />
            Importar
          </Link>
        </Button>

        {/* Notificações */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="relative"
              aria-label={
                unreadCount > 0
                  ? `${unreadCount} notificações não lidas`
                  : 'Notificações'
              }
            >
              <Bell className="h-5 w-5" aria-hidden="true" />
              {unreadCount > 0 && (
                <span
                  className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground"
                  aria-hidden="true"
                >
                  {unreadCount}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-0" align="end">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="font-semibold text-sm">Notificações</h2>
              {unreadCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-auto p-0 text-xs text-primary hover:bg-transparent hover:underline"
                >
                  Marcar todas como lidas
                </Button>
              )}
            </div>

            <div
              className="max-h-80 overflow-y-auto"
              role="log"
              aria-live="polite"
              aria-label="Lista de notificações"
            >
              {NOTIFICATIONS.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <Bell className="h-8 w-8 text-muted-foreground/40 mb-2" aria-hidden="true" />
                  <p className="text-sm text-muted-foreground">
                    Nenhuma notificação por enquanto
                  </p>
                </div>
              ) : (
                NOTIFICATIONS.map((notification) => (
                  <article
                    key={notification.id}
                    className="flex cursor-pointer gap-3 border-b border-border px-4 py-3 transition-colors last:border-0 hover:bg-secondary/50"
                  >
                    <div className="mt-1" aria-hidden="true">
                      {notification.unread && (
                        <span className="block h-2 w-2 rounded-full bg-primary" />
                      )}
                    </div>
                    <div className="flex-1 space-y-1">
                      <p className="text-sm font-medium leading-tight">
                        {notification.title}
                        {notification.unread && (
                          <span className="sr-only"> (não lida)</span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {notification.description}
                      </p>
                    </div>
                    <time
                      className="shrink-0 text-xs text-muted-foreground"
                      dateTime={notification.time}
                    >
                      {notification.time}
                    </time>
                  </article>
                ))
              )}
            </div>

            <div className="border-t border-border p-2">
              <Button variant="ghost" className="w-full text-sm" size="sm">
                Ver todas as notificações
              </Button>
            </div>
          </PopoverContent>
        </Popover>

        <div className="mx-1 h-8 w-px bg-border" aria-hidden="true" />

        {/* Info da empresa */}
        {company && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="hidden h-9 gap-2 px-3 md:flex" aria-label={`Empresa: ${company.name}`}>
                <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10">
                  <Building2 className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                </div>
                <span className="max-w-24 truncate text-sm font-medium">{company.name}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-52" align="end">
              <DropdownMenuLabel className="font-normal">
                <p className="text-xs text-muted-foreground">Plano atual</p>
                <p className="text-sm font-semibold">{PLAN_LABELS[company.plan] ?? company.plan}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {company.uploadsUsed} / {company.uploadsLimit} uploads usados
                </p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => router.push('/dashboard/billing')}>
                <CreditCard className="mr-2 h-4 w-4" aria-hidden="true" />
                Plano e faturamento
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => router.push('/dashboard/settings')}>
                <Settings className="mr-2 h-4 w-4" aria-hidden="true" />
                Configurações da empresa
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* Menu do usuário */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="relative h-9 w-9 rounded-full ring-2 ring-transparent transition-all hover:ring-primary/20"
              aria-label={`Menu do usuário: ${user?.name ?? 'Usuário'}`}
            >
              <Avatar className="h-9 w-9">
                <AvatarFallback className="bg-primary text-sm font-semibold text-primary-foreground">
                  {user ? getInitials(user.name) : 'U'}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="end" forceMount>
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none">{user?.name}</p>
                <p className="text-xs leading-none text-muted-foreground">{user?.email}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push('/dashboard/settings')}>
              <User className="mr-2 h-4 w-4" aria-hidden="true" />
              Meu perfil
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push('/dashboard/settings')}>
              <Settings className="mr-2 h-4 w-4" aria-hidden="true" />
              Configurações
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={logout}
              className="text-destructive focus:bg-destructive/10 focus:text-destructive"
            >
              <LogOut className="mr-2 h-4 w-4" aria-hidden="true" />
              Sair da conta
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
