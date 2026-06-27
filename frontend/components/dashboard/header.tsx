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
import { LogOut, Settings, User, Building2, Search, CreditCard, Upload } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { getInitials } from '@/lib/utils'
import { CommandMenuTrigger } from '@/components/dashboard/command-menu'

interface DashboardHeaderProps {
  title?: string
  description?: string
}

const PLAN_LABELS: Record<string, string> = {
  free: 'Gratuito',
  pro: 'Profissional',
  enterprise: 'Enterprise',
}

export function DashboardHeader({ title, description }: DashboardHeaderProps) {
  const { user, company, logout } = useAuth()
  const router = useRouter()

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
          <p className="hidden truncate text-sm text-muted-foreground sm:block">{description}</p>
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

        {/* Notificações: ocultas até existir backend de notificações. Não exibir um
            controle morto (sino que só abre um popover vazio com botão sem ação). */}

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
              {user?.role === 'admin' && (
                <DropdownMenuItem onClick={() => router.push('/dashboard/billing')}>
                  <CreditCard className="mr-2 h-4 w-4" aria-hidden="true" />
                  Plano e faturamento
                </DropdownMenuItem>
              )}
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
