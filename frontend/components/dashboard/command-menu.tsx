'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from '@/components/ui/command'
import {
  LayoutDashboard, Briefcase, Send, LineChart, Upload, Users, Plug2,
  CreditCard, Settings, History, Search,
} from 'lucide-react'

const ACTIONS = [
  { label: 'Importar dados de vendas', href: '/dashboard/upload', icon: Upload },
  { label: 'Disparar para clientes inativos', href: '/dashboard/disparo', icon: Send },
]

const GOTO = [
  { label: 'Visão geral', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Carteira ativa', href: '/dashboard/carteira', icon: Briefcase },
  { label: 'Disparo', href: '/dashboard/disparo', icon: Send },
  { label: 'Insights', href: '/dashboard/insights', icon: LineChart },
  { label: 'Equipe', href: '/dashboard/team', icon: Users },
  { label: 'Integrações', href: '/dashboard/integrations', icon: Plug2 },
  { label: 'Faturamento', href: '/dashboard/billing', icon: CreditCard },
  { label: 'Configurações', href: '/dashboard/settings', icon: Settings },
  { label: 'Histórico de análises', href: '/dashboard/history', icon: History },
]

const OPEN_EVENT = 'open-command-menu'

/** Mountado uma vez no layout: escuta ⌘K/Ctrl+K (global) e o evento de abertura. */
export function CommandMenu() {
  const [open, setOpen] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    const onOpen = () => setOpen(true)
    document.addEventListener('keydown', onKey)
    document.addEventListener(OPEN_EVENT, onOpen)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener(OPEN_EVENT, onOpen)
    }
  }, [])

  function go(href: string) {
    setOpen(false)
    router.push(href)
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen} title="Comandos" description="Busque telas e ações">
      <CommandInput placeholder="Buscar telas, ações…" />
      <CommandList>
        <CommandEmpty>Nada encontrado.</CommandEmpty>
        <CommandGroup heading="Ações">
          {ACTIONS.map((a) => (
            <CommandItem key={a.label} value={a.label} onSelect={() => go(a.href)}>
              <a.icon className="mr-2 h-4 w-4 text-muted-foreground" />
              {a.label}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Ir para">
          {GOTO.map((g) => (
            <CommandItem key={g.href} value={g.label} onSelect={() => go(g.href)}>
              <g.icon className="mr-2 h-4 w-4 text-muted-foreground" />
              {g.label}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}

/** Botão da topbar que abre o ⌘K. */
export function CommandMenuTrigger() {
  return (
    <button
      type="button"
      onClick={() => document.dispatchEvent(new CustomEvent(OPEN_EVENT))}
      className="flex h-9 w-full max-w-sm items-center gap-2 rounded-lg border border-border bg-secondary/50 px-3 text-sm text-muted-foreground transition-colors hover:bg-secondary"
      aria-label="Abrir busca de comandos"
    >
      <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="flex-1 truncate text-left">Buscar ou pular para…</span>
      <kbd className="hidden rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline">
        ⌘K
      </kbd>
    </button>
  )
}
