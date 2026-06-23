//app/(auth)/layout.tsx
'use client'

import Link from 'next/link'
import { Bricolage_Grotesque } from 'next/font/google'
import { Radar, MessageCircle, ShieldCheck, TrendingUp } from 'lucide-react'

const display = Bricolage_Grotesque({
  subsets: ['latin'],
  weight: ['600', '700', '800'],
  variable: '--font-display',
})

const points = [
  { icon: Radar, title: 'Veja quem parou de comprar', body: 'RFV + churn preditivo, com histórico real de cada cliente.' },
  { icon: MessageCircle, title: 'Reative pelo seu WhatsApp', body: 'Mensagem por IA, do seu próprio número. Você só aprova.' },
  { icon: ShieldCheck, title: 'LGPD by design', body: 'Só métricas agregadas, com opt-out e exclusão de PII.' },
]

function Wordmark({ light }: { light?: boolean }) {
  return (
    <Link href="/" className="inline-flex items-center gap-2">
      <span className={`grid h-8 w-8 place-items-center rounded-lg shadow-sm ${light ? 'bg-white/15 text-white backdrop-blur' : 'bg-[var(--primary)] text-white'}`}>
        <Radar className="h-4 w-4" />
      </span>
      <span className={`font-[family-name:var(--font-display)] text-lg font-extrabold tracking-[-0.02em] ${light ? 'text-white' : 'text-[var(--foreground)]'}`}>
        Radar<span className={light ? 'text-white/70' : 'text-[var(--primary)]'}>.</span>
      </span>
    </Link>
  )
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`auth-2026 ${display.variable} flex min-h-screen bg-[var(--background)] text-[var(--foreground)] antialiased`}>
      <AuthStyles />

      {/* painel de marca (desktop) */}
      <aside
        className="relative hidden w-1/2 flex-col justify-between overflow-hidden p-12 lg:flex"
        style={{ background: 'linear-gradient(155deg, #4f46e5 0%, #4338ca 60%, #3730a3 100%)' }}
      >
        <div className="pointer-events-none absolute inset-0 [background:radial-gradient(60%_50%_at_85%_0%,rgba(6,182,212,0.45),transparent),radial-gradient(50%_50%_at_0%_100%,rgba(255,255,255,0.16),transparent)]" />

        <div className="relative"><Wordmark light /></div>

        <div className="relative max-w-md">
          <h2 className="font-[family-name:var(--font-display)] text-4xl font-extrabold leading-[1.05] tracking-[-0.02em] text-white">
            Receita que some,
            <br />
            recuperada.
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-white/80">
            O Radar lê seu histórico de vendas e te mostra exatamente quem reativar — antes do concorrente.
          </p>

          <div className="mt-9 space-y-3">
            {points.map((p) => (
              <div key={p.title} className="flex items-start gap-3.5 rounded-2xl bg-white/10 p-4 ring-1 ring-white/15 backdrop-blur-sm">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/15 text-white">
                  <p.icon className="h-5 w-5" />
                </span>
                <div>
                  <p className="font-semibold text-white">{p.title}</p>
                  <p className="mt-0.5 text-sm text-white/70">{p.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* card flutuante */}
        <div className="relative flex items-center gap-3 self-start rounded-2xl bg-white p-3.5 shadow-xl">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-[color-mix(in_oklab,var(--success)_16%,transparent)] text-[var(--success)]">
            <TrendingUp className="h-5 w-5" />
          </span>
          <div>
            <div className="font-[family-name:var(--font-display)] text-lg font-bold leading-none text-[var(--success)]">R$ 12.400</div>
            <div className="mt-1 text-xs text-[var(--muted-foreground)]">recuperável neste cliente</div>
          </div>
        </div>
      </aside>

      {/* lado do formulário */}
      <div className="flex w-full flex-col lg:w-1/2">
        <header className="flex h-16 items-center justify-between px-6 lg:px-8">
          <div className="lg:hidden"><Wordmark /></div>
          <div className="hidden lg:block" />
          <nav className="flex items-center gap-3">
            <Link href="/login" className="text-sm font-medium text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]">
              Entrar
            </Link>
            <Link href="/signup" className="rounded-full bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-[var(--primary-foreground)] shadow-[0_8px_24px_-8px_rgba(79,70,229,0.7)] transition-transform hover:-translate-y-0.5">
              Criar conta
            </Link>
          </nav>
        </header>

        <main className="flex flex-1 items-center justify-center p-6 lg:p-8">{children}</main>

        <footer className="px-6 py-4 lg:px-8">
          <p className="text-center text-sm text-[var(--muted-foreground)]">© 2026 Radar Comercial. Todos os direitos reservados.</p>
        </footer>
      </div>
    </div>
  )
}

/* Retematiza os tokens shadcn DENTRO do auth para a paleta "Modern Tech
   Bright" (índigo/branco) — assim os componentes ui herdam sem editar ui/. */
function AuthStyles() {
  return (
    <style>{`
      .auth-2026 {
        --background: #ffffff;
        --foreground: #0e1220;
        --card: #ffffff;
        --card-foreground: #0e1220;
        --popover: #ffffff;
        --popover-foreground: #0e1220;
        --primary: #4f46e5;
        --primary-foreground: #ffffff;
        --secondary: #f4f5fb;
        --secondary-foreground: #0e1220;
        --muted: #f4f5fb;
        --muted-foreground: #565d70;
        --accent: #eef0fc;
        --accent-foreground: #4f46e5;
        --border: rgba(14,18,32,0.10);
        --input: rgba(14,18,32,0.14);
        --ring: #4f46e5;
        --success: #10b981;
        --destructive: #ef4444;
      }
      .auth-2026 a:focus-visible, .auth-2026 button:focus-visible {
        outline: 2px solid var(--primary); outline-offset: 2px;
      }
    `}</style>
  )
}
