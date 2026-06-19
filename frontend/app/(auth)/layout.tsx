//app/(auth)/layout.tsx
'use client'

import { Logo } from '@/components/common/logo'
import Link from 'next/link'
import { BarChart3, TrendingUp, Shield } from 'lucide-react'

function AuthIllustration() {
  return (
    <div className="relative flex h-full flex-col justify-between p-12">
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -left-20 -top-20 h-96 w-96 rounded-full bg-primary-foreground/10 blur-3xl" />
        <div className="absolute -bottom-20 -right-20 h-96 w-96 rounded-full bg-primary-foreground/5 blur-3xl" />
      </div>

      <div>
        <Logo size="lg" className="text-primary-foreground" />
      </div>

      <div className="space-y-8">
        <div>
          <h2 className="font-serif text-3xl tracking-[-0.02em] text-primary-foreground">
            Transforme dados em receita
          </h2>
          <p className="mt-3 text-lg text-primary-foreground/80">
            Descubra oportunidades escondidas nos seus dados de vendas e recupere receita perdida.
          </p>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-4 rounded-lg bg-primary-foreground/10 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-foreground/20">
              <BarChart3 className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <p className="font-medium text-primary-foreground">Análise automática</p>
              <p className="text-sm text-primary-foreground/70">Detectamos padrões de compra automaticamente</p>
            </div>
          </div>

          <div className="flex items-center gap-4 rounded-lg bg-primary-foreground/10 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-foreground/20">
              <TrendingUp className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <p className="font-medium text-primary-foreground">Insights acionáveis</p>
              <p className="text-sm text-primary-foreground/70">Saiba exatamente como recuperar receita</p>
            </div>
          </div>

          <div className="flex items-center gap-4 rounded-lg bg-primary-foreground/10 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-foreground/20">
              <Shield className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <p className="font-medium text-primary-foreground">Dados seguros</p>
              <p className="text-sm text-primary-foreground/70">Criptografia e isolamento multi-tenant</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6 rounded-xl bg-primary-foreground/10 p-6">
        <div className="text-center">
          <div className="font-serif text-2xl tabular-nums text-primary-foreground">R$ 2M+</div>
          <div className="text-xs text-primary-foreground/70">Receita recuperada</div>
        </div>
        <div className="text-center">
          <div className="font-serif text-2xl tabular-nums text-primary-foreground">500+</div>
          <div className="text-xs text-primary-foreground/70">Empresas ativas</div>
        </div>
        <div className="text-center">
          <div className="font-serif text-2xl tabular-nums text-primary-foreground">98%</div>
          <div className="text-xs text-primary-foreground/70">Satisfação</div>
        </div>
      </div>
    </div>
  )
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <div className="hidden w-1/2 bg-primary lg:block">
        <AuthIllustration />
      </div>

      <div className="flex w-full flex-col bg-background lg:w-1/2">
        <header className="flex h-16 items-center justify-between px-6 lg:px-8">
          <Link href="/" className="lg:hidden">
            <Logo size="md" />
          </Link>
          <div className="lg:hidden" />
          <nav className="flex items-center gap-3">
            <Link
              href="/login"
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Entrar
            </Link>
            <Link
              href="/signup"
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
            >
              Criar conta
            </Link>
          </nav>
        </header>

        <main className="flex flex-1 items-center justify-center p-6 lg:p-8">
          {children}
        </main>

        <footer className="px-6 py-4 lg:px-8">
          <p className="text-center text-sm text-muted-foreground">
            2024 Radar Comercial. Todos os direitos reservados.
          </p>
        </footer>
      </div>
    </div>
  )
}
