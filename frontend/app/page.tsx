//app/page.tsx
import Link from 'next/link'
import { Bricolage_Grotesque } from 'next/font/google'
import { AppPreview } from '@/components/landing/app-preview'
import { CountUp } from '@/components/landing/count-up'
import { ScrollProgress } from '@/components/landing/scroll-progress'
import { ScrollReveal } from '@/components/landing/scroll-reveal'
import { getInitials } from '@/lib/utils'
import { PLAN_CATALOG } from '@/lib/plans'
import {
  ArrowRight,
  ArrowUpRight,
  TrendingUp,
  TrendingDown,
  Upload,
  Radar,
  Send,
  Sparkles,
  Check,
  Minus,
  X,
  FileSpreadsheet,
  Sheet,
  Code2,
  Plus,
  MessageCircle,
  Wand2,
  Target,
  Trophy,
  ShieldCheck,
  RefreshCw,
  Lock,
  Headphones,
} from 'lucide-react'

const display = Bricolage_Grotesque({
  subsets: ['latin'],
  weight: ['600', '700', '800'],
  variable: '--font-display',
})

/* ── dados ────────────────────────────────────────────────────────── */

const steps = [
  { n: '01', icon: Upload, title: 'Conecte seus dados', body: 'CSV, Excel, Google Sheets ou API. O Radar lê seu histórico e organiza sozinho em 2 minutos.' },
  { n: '02', icon: Radar, title: 'Veja quem está sumindo', body: 'RFV + churn preditivo apontam quem parou de comprar, quem está prestes a sumir e quanto vale recuperar.' },
  { n: '03', icon: Send, title: 'Reative em um toque', body: 'Mensagem por IA disparada do seu próprio WhatsApp ou e-mail. Você só aprova — sem virar CRM.' },
]

const capabilities: { k: string; v: string; warn?: boolean }[] = [
  { k: '3 canais', v: 'CSV, Google Sheets e API de ingestão' },
  { k: 'Churn previsto', v: 'antes do cliente sumir, não depois', warn: true },
  { k: 'WhatsApp + E-mail', v: 'disparo do seu número, com IA' },
  { k: 'LGPD by design', v: 'só métricas agregadas, sem transação bruta' },
]

const integrations = [
  { icon: FileSpreadsheet, label: 'CSV / Excel' },
  { icon: Sheet, label: 'Google Sheets' },
  { icon: Code2, label: 'API' },
]

type Mark = 'yes' | 'partial' | 'no'
const comparison: { feature: string; radar: Mark; sheet: Mark; crm: Mark }[] = [
  { feature: 'Mostra quem parou de comprar', radar: 'yes', sheet: 'partial', crm: 'no' },
  { feature: 'Avisa antes do cliente sumir (churn preditivo)', radar: 'yes', sheet: 'no', crm: 'no' },
  { feature: 'Oportunidade qualificada com histórico real', radar: 'yes', sheet: 'no', crm: 'partial' },
  { feature: 'Mensagem de reativação por IA', radar: 'yes', sheet: 'no', crm: 'partial' },
  { feature: 'Funciona sem alimentar na mão', radar: 'yes', sheet: 'no', crm: 'no' },
  { feature: 'Preço pra PME brasileira', radar: 'yes', sheet: 'yes', crm: 'no' },
]

const faqs = [
  { q: 'Preciso trocar meu CRM ou sistema?', a: 'Não. O Radar lê o histórico que você já tem (CSV, Excel, Google Sheets ou API) e funciona ao lado das ferramentas que você usa. Ele não substitui seu CRM — ele te diz onde agir.' },
  { q: 'Meus dados ficam seguros? E a LGPD?', a: 'Sim. Guardamos apenas métricas agregadas por cliente, não suas transações brutas. O contato do cliente só é usado para o disparo que você autorizar, sempre com opção de descadastro.' },
  { q: 'E se minha planilha de vendas é bagunçada?', a: 'O Radar normaliza nomes de coluna em português e inglês, entende vários formatos de data e valida os dados na importação. Não precisa arrumar nada antes.' },
  { q: 'Como funciona o disparo no WhatsApp?', a: 'Sai do seu próprio número — você conecta lendo um QR Code. A mensagem é personalizada por IA e você aprova antes. Há intervalo entre envios e opt-out automático para proteger seu número.' },
  { q: 'Quanto tempo até ver resultado?', a: 'Minutos. Você sobe o histórico de vendas e já vê quem sumiu, quanto vale recuperar e a mensagem pronta para enviar.' },
  { q: 'Dá pra começar de graça?', a: 'Dá. O plano gratuito libera 5 análises por mês, sem cartão de crédito. Você só cresce de plano quando precisar de mais time ou volume.' },
]

const bento = [
  { icon: Radar, title: 'Churn preditivo', body: 'Antecipa quem está prestes a sumir pela cadência de compra — você age antes de perder.', wide: true, kind: 'churn' as const },
  { icon: Wand2, title: 'Mensagem por IA', body: 'Texto pronto e pessoal pra cada cliente, com o contexto da última compra. Você só aprova.', wide: true, kind: 'ai' as const },
  { icon: MessageCircle, title: 'Disparo no WhatsApp', body: 'Do seu próprio número, com intervalo anti-bloqueio e opt-out.' },
  { icon: Target, title: 'Carteira ativa', body: 'Cada oportunidade vira tarefa: a contatar, contatado, ganho, perdido.' },
  { icon: Trophy, title: 'Ranking do time', body: 'Conversão por vendedor e ROI (ganho ÷ identificado) no topo.' },
  { icon: ShieldCheck, title: 'LGPD by design', body: 'Só métricas agregadas. Contato com opt-out e exclusão de PII.' },
]

const baseFeatures = [
  { icon: ShieldCheck, label: 'LGPD by design' },
  { icon: RefreshCw, label: 'Atualizações incluídas' },
  { icon: Lock, label: 'Dados isolados por empresa' },
  { icon: Headphones, label: 'Suporte em português' },
]

const trustBadges = ['Sem fidelidade', 'Sem cartão no plano grátis', 'Cancele quando quiser']

type Cell = boolean | string
const planMatrix: { feature: string; free: Cell; pro: Cell; ent: Cell }[] = [
  { feature: 'Análises por mês', free: '5', pro: '50', ent: 'Ilimitado' },
  { feature: 'Usuários', free: '1', pro: 'até 10', ent: 'Ilimitado' },
  { feature: 'Insights e oportunidades', free: true, pro: true, ent: true },
  { feature: 'Carteira ativa + ranking', free: true, pro: true, ent: true },
  { feature: 'Mensagem por IA', free: false, pro: true, ent: true },
  { feature: 'Disparo WhatsApp + e-mail', free: false, pro: true, ent: true },
  { feature: 'API de ingestão', free: false, pro: true, ent: true },
  { feature: 'Conectores de ERP', free: false, pro: false, ent: true },
  { feature: 'SSO', free: false, pro: false, ent: true },
  { feature: 'Suporte', free: 'Comunidade', pro: 'Prioritário', ent: 'Dedicado' },
]

/* ── página ───────────────────────────────────────────────────────── */

export default function HomePage() {
  return (
    <div className={`landing-2026 ${display.variable} relative min-h-screen overflow-x-clip bg-[var(--bg)] text-[var(--ink)] antialiased`}>
      <LandingStyles />
      <ScrollProgress />
      <ScrollReveal />

      {/* ── NAV ──────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-[var(--line)] bg-[var(--bg)]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
          <Wordmark />
          <nav className="hidden items-center gap-8 md:flex">
            {[
              ['Como funciona', '#como-funciona'],
              ['Produto', '#produto'],
              ['Preço', '#preco'],
              ['Dúvidas', '#faq'],
            ].map(([label, href]) => (
              <Link key={href} href={href} className="text-sm font-medium text-[var(--muted)] transition-colors hover:text-[var(--ink)]">
                {label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link href="/login" className="hidden text-sm font-medium text-[var(--muted)] transition-colors hover:text-[var(--ink)] sm:block">
              Entrar
            </Link>
            <CTA href="/signup" small>Começar grátis</CTA>
          </div>
        </div>
      </header>

      <main>
        {/* ── HERO ───────────────────────────────────────────── */}
        <section className="relative px-5 pb-16 pt-14 sm:px-8 sm:pt-20 lg:pb-24">
          {/* atmosfera clara */}
          <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px] overflow-hidden">
            <div className="absolute left-1/2 top-[-220px] h-[460px] w-[860px] max-w-full -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(79,70,229,0.16),transparent)]" />
            <div className="absolute left-1/2 top-[-160px] h-[360px] w-[620px] max-w-full -translate-x-[35%] rounded-full bg-[radial-gradient(closest-side,rgba(6,182,212,0.12),transparent)]" />
            <div className="rdr-grid absolute inset-0 opacity-[0.5]" />
          </div>

          <div className="mx-auto max-w-3xl text-center">
            <span className="rdr-rise inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--card)] px-3.5 py-1.5 text-xs font-medium text-[var(--muted)] shadow-sm" style={{ animationDelay: '0ms' }}>
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--primary)] opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--primary)]" />
              </span>
              Radar de receita · para PMEs
            </span>

            <h1 className="rdr-rise mt-6 font-[family-name:var(--font-display)] text-[2.6rem] font-extrabold leading-[1.02] tracking-[-0.03em] text-[var(--ink)] sm:text-6xl lg:text-[4.2rem]" style={{ animationDelay: '70ms' }}>
              Seus clientes somem em silêncio.
              <br />
              <span className="rdr-grad">A gente te avisa a tempo.</span>
            </h1>

            <p className="rdr-rise mx-auto mt-6 max-w-xl text-pretty text-base leading-relaxed text-[var(--muted)] sm:text-lg" style={{ animationDelay: '140ms' }}>
              O Radar lê seu histórico de vendas, mostra quem parou de comprar, quanto vale recuperar e
              te ajuda a trazer de volta — pelo seu WhatsApp, sem virar CRM.
            </p>

            <div className="rdr-rise mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row" style={{ animationDelay: '210ms' }}>
              <CTA href="/signup" big>Começar grátis</CTA>
              <Link href="#como-funciona" className="group inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--card)] px-6 py-3.5 text-sm font-semibold text-[var(--ink)] shadow-sm transition-all hover:border-[var(--ink)]/20 hover:shadow">
                Ver como funciona
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
            <p className="rdr-rise mt-4 text-sm text-[var(--muted)]" style={{ animationDelay: '260ms' }}>
              Grátis até 5 análises · sem cartão de crédito.
            </p>
          </div>

          {/* showcase do produto */}
          <div className="rdr-rise relative mx-auto mt-14 max-w-5xl" style={{ animationDelay: '320ms' }}>
            <div className="pointer-events-none absolute -inset-x-10 -top-10 bottom-0 -z-10 rounded-[2.5rem] bg-[radial-gradient(60%_50%_at_50%_0%,rgba(79,70,229,0.14),transparent)]" />
            <AppPreview />

            {/* cards flutuantes (só desktop) */}
            <div aria-hidden="true" className="pointer-events-none absolute -right-6 top-12 hidden rounded-2xl border border-[var(--line)] bg-[var(--card)] p-3.5 shadow-xl lg:block">
              <div className="flex items-center gap-2.5">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-[color-mix(in_oklab,var(--gain)_14%,transparent)] text-[var(--gain)]"><TrendingUp className="h-5 w-5" /></span>
                <div>
                  <div className="font-[family-name:var(--font-display)] text-lg font-bold leading-none text-[var(--gain)]">
                    <CountUp to={12400} prefix="R$ " />
                  </div>
                  <div className="mt-1 text-xs text-[var(--muted)]">recuperável neste cliente</div>
                </div>
              </div>
            </div>
            <div aria-hidden="true" className="pointer-events-none absolute -left-6 bottom-10 hidden rounded-2xl border border-[var(--line)] bg-[var(--card)] p-3.5 shadow-xl lg:block">
              <div className="flex items-center gap-2.5">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-[color-mix(in_oklab,var(--loss)_12%,transparent)] text-[var(--loss)]"><TrendingDown className="h-5 w-5" /></span>
                <div>
                  <div className="font-[family-name:var(--font-display)] text-lg font-bold leading-none text-[var(--ink)]">
                    <CountUp to={14} /> clientes
                  </div>
                  <div className="mt-1 text-xs text-[var(--muted)]">em risco agora</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── TRUST / INTEGRAÇÕES ────────────────────────────── */}
        <section className="border-y border-[var(--line)] bg-[var(--bg-soft)] px-5 py-8 sm:px-8">
          <div className="mx-auto flex max-w-5xl flex-col items-center gap-5 sm:flex-row sm:justify-between">
            <span className="text-sm font-medium text-[var(--muted)]">Conecta com o que você já usa</span>
            <div className="flex flex-wrap items-center justify-center gap-2.5">
              {integrations.map((it) => (
                <span key={it.label} className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--card)] px-3.5 py-1.5 text-sm font-medium text-[var(--ink)]">
                  <it.icon className="h-4 w-4 text-[var(--primary)]" />
                  {it.label}
                </span>
              ))}
              <span className="inline-flex items-center gap-2 rounded-full border border-dashed border-[var(--line)] px-3.5 py-1.5 text-sm text-[var(--muted)]">
                <Plus className="h-3.5 w-3.5" /> Omie, Bling, Conta Azul · em breve
              </span>
            </div>
          </div>
        </section>

        {/* ── COMO FUNCIONA ──────────────────────────────────── */}
        <section id="como-funciona" className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
          <SectionHead kicker="Como funciona" title="Do dado bruto à venda recuperada" sub="Três passos. Sem planilha mágica, sem consultoria." />
          <div className="mt-14 grid gap-5 md:grid-cols-3">
            {steps.map((s, i) => (
              <div key={s.n} className="rdr-reveal group relative rounded-3xl border border-[var(--line)] bg-[var(--card)] p-7 shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg" style={{ ['--d' as string]: `${i * 90}ms` }}>
                <div className="flex items-center justify-between">
                  <span className="font-[family-name:var(--font-display)] text-5xl font-extrabold text-[var(--line)] transition-colors group-hover:text-[color-mix(in_oklab,var(--primary)_22%,transparent)]">{s.n}</span>
                  <div className="grid h-11 w-11 place-items-center rounded-xl bg-[color-mix(in_oklab,var(--primary)_10%,transparent)] text-[var(--primary)]">
                    <s.icon className="h-5 w-5" />
                  </div>
                </div>
                <h3 className="mt-6 font-[family-name:var(--font-display)] text-xl font-bold tracking-[-0.01em]">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">{s.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── FEATURE 1: quem está sumindo ───────────────────── */}
        <section id="produto" className="bg-[var(--bg-soft)] px-5 py-20 sm:px-8 sm:py-28">
          <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-2">
            <div className="rdr-reveal">
              <Kicker>O que entrega</Kicker>
              <h2 className="mt-3 font-[family-name:var(--font-display)] text-3xl font-extrabold tracking-[-0.02em] sm:text-4xl">
                Veja quem está sumindo — <span className="rdr-grad">antes de virar prejuízo</span>
              </h2>
              <p className="mt-4 text-lg leading-relaxed text-[var(--muted)]">
                Cada oportunidade já vem qualificada com histórico real — último produto, frequência de
                compra e ticket médio. Você sabe exatamente quem procurar e o que dizer.
              </p>
              <div className="mt-7 grid grid-cols-2 gap-3">
                {capabilities.map((c, i) => (
                  <div key={c.k} className="rdr-reveal rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4 shadow-sm" style={{ ['--d' as string]: `${i * 70}ms` }}>
                    <div className={`font-[family-name:var(--font-display)] text-lg font-bold ${c.warn ? 'text-[var(--loss)]' : 'text-[var(--primary)]'}`}>{c.k}</div>
                    <div className="mt-1 text-sm text-[var(--muted)]">{c.v}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="rdr-reveal lg:pl-6"><RiskList /></div>
          </div>
        </section>

        {/* ── FEATURE 2: reativação WhatsApp ─────────────────── */}
        <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div className="rdr-reveal order-2 lg:order-1 lg:pr-6"><MessageMock /></div>
            <div className="rdr-reveal order-1 lg:order-2">
              <Kicker>Reativação</Kicker>
              <h2 className="mt-3 font-[family-name:var(--font-display)] text-3xl font-extrabold tracking-[-0.02em] sm:text-4xl">
                Reative em um toque, <span className="rdr-grad">do seu WhatsApp</span>
              </h2>
              <p className="mt-4 text-lg leading-relaxed text-[var(--muted)]">
                A IA escreve uma mensagem pessoal pra cada cliente, com o contexto da última compra.
                Sai do seu próprio número — o cliente reconhece você. Você só revisa e aprova.
              </p>
              <ul className="mt-6 space-y-3">
                {['Mensagem personalizada por IA', 'Intervalo anti-bloqueio + opt-out automático', 'Marca a oportunidade como “contatada” na carteira'].map((t) => (
                  <li key={t} className="flex items-start gap-2.5 text-[var(--ink)]/85">
                    <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[color-mix(in_oklab,var(--gain)_16%,transparent)] text-[var(--gain)]"><Check className="h-3 w-3" strokeWidth={3} /></span>
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* ── BENTO: recursos ────────────────────────────────── */}
        <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
          <SectionHead kicker="Recursos" title="Tudo que o Radar faz por você" sub="Da detecção à recuperação, num lugar só — sem virar mais um sistema pra alimentar." />
          <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {bento.map((b, i) => (
              <div
                key={b.title}
                className={`rdr-reveal group rounded-3xl border border-[var(--line)] bg-[var(--card)] p-6 shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg ${b.wide ? 'lg:col-span-2' : ''}`}
                style={{ ['--d' as string]: `${i * 60}ms` }}
              >
                <div className="flex items-center gap-3">
                  <div className="grid h-11 w-11 place-items-center rounded-xl bg-[color-mix(in_oklab,var(--primary)_10%,transparent)] text-[var(--primary)]">
                    <b.icon className="h-5 w-5" />
                  </div>
                  <h3 className="font-[family-name:var(--font-display)] text-lg font-bold tracking-[-0.01em]">{b.title}</h3>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">{b.body}</p>
                {b.kind === 'churn' && <ChurnMini />}
                {b.kind === 'ai' && <AiMini />}
              </div>
            ))}
          </div>
        </section>

        {/* ── COMPARATIVO ────────────────────────────────────── */}
        <section className="bg-[var(--bg-soft)] px-5 py-20 sm:px-8 sm:py-28">
          <div className="mx-auto max-w-6xl">
            <SectionHead kicker="Por que Radar" title="O que a planilha e o CRM não fazem" sub="Você já tem onde guardar venda. O que falta é alguém apontando onde está o dinheiro parado." />
            <div className="rdr-reveal mt-12 overflow-x-auto">
              <div className="min-w-[560px] overflow-hidden rounded-3xl border border-[var(--line)] bg-[var(--card)] shadow-sm">
                <div className="grid grid-cols-[1.7fr_1fr_1fr_1fr] border-b border-[var(--line)] text-center text-xs font-semibold sm:text-sm">
                  <div className="px-4 py-4 text-left text-[var(--muted)]">Recurso</div>
                  <div className="relative bg-[color-mix(in_oklab,var(--primary)_7%,transparent)] px-2 py-4 font-[family-name:var(--font-display)] text-[var(--primary)]">
                    Radar
                    <span className="absolute inset-x-0 bottom-0 h-0.5 bg-[var(--primary)]" />
                  </div>
                  <div className="px-2 py-4 text-[var(--muted)]">Planilha</div>
                  <div className="px-2 py-4 text-[var(--muted)]">CRM</div>
                </div>
                {comparison.map((row, i) => (
                  <div key={row.feature} className={`grid grid-cols-[1.7fr_1fr_1fr_1fr] items-center text-center ${i % 2 ? 'bg-[var(--bg-soft)]' : ''}`}>
                    <div className="px-4 py-3.5 text-left text-sm text-[var(--ink)]/85">{row.feature}</div>
                    <div className="bg-[color-mix(in_oklab,var(--primary)_7%,transparent)] px-2 py-3.5"><MarkCell v={row.radar} highlight /></div>
                    <div className="px-2 py-3.5"><MarkCell v={row.sheet} /></div>
                    <div className="px-2 py-3.5"><MarkCell v={row.crm} /></div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── PREÇO ──────────────────────────────────────────── */}
        <section id="preco" className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
          <SectionHead kicker="Preço" title="Comece grátis. Cresça por assento." sub="Sem fidelidade. Você paga por usuário ativo no time comercial." />
          <div className="mt-14 grid gap-5 lg:grid-cols-3">
            <PriceCard name={PLAN_CATALOG.free.name} price={PLAN_CATALOG.free.price} period={PLAN_CATALOG.free.period} note="Para começar a explorar." features={PLAN_CATALOG.free.features} cta="Começar grátis" />
            <PriceCard name={PLAN_CATALOG.pro.name} price={PLAN_CATALOG.pro.price} period={PLAN_CATALOG.pro.period} note="Para times em crescimento." anchor="Recupere 1 cliente no mês e o plano se paga." features={PLAN_CATALOG.pro.features} cta="Começar agora" featured />
            <PriceCard name={PLAN_CATALOG.enterprise.name} price={PLAN_CATALOG.enterprise.price} period={PLAN_CATALOG.enterprise.period} note="Para grandes operações." features={PLAN_CATALOG.enterprise.features} cta="Falar com vendas" />
          </div>

          {/* todos os planos incluem */}
          <div className="rdr-reveal mt-8 rounded-3xl border border-[var(--line)] bg-[var(--bg-soft)] p-6 sm:p-7">
            <div className="text-center text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Todos os planos incluem</div>
            <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
              {baseFeatures.map((f) => (
                <div key={f.label} className="flex flex-col items-center gap-2 text-center">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--card)] text-[var(--primary)] shadow-sm ring-1 ring-[var(--line)]"><f.icon className="h-5 w-5" /></span>
                  <span className="text-sm font-medium text-[var(--ink)]">{f.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* selos de confiança */}
          <div className="rdr-reveal mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
            {trustBadges.map((t) => (
              <span key={t} className="inline-flex items-center gap-1.5 text-sm text-[var(--muted)]">
                <Check className="h-4 w-4 text-[var(--gain)]" /> {t}
              </span>
            ))}
          </div>

          {/* matriz comparativa de recursos */}
          <details className="rdr-faq rdr-reveal group mt-8 overflow-hidden rounded-3xl border border-[var(--line)] bg-[var(--card)]">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-4 text-sm font-semibold text-[var(--ink)]">
              Comparar todos os recursos
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-[var(--line)] text-[var(--primary)] transition-transform duration-300 group-open:rotate-45">
                <Plus className="h-4 w-4" />
              </span>
            </summary>
            <div className="overflow-x-auto border-t border-[var(--line)]">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-[var(--line)] text-center">
                    <th className="px-5 py-3 text-left font-medium text-[var(--muted)]">Recurso</th>
                    <th className="px-3 py-3 font-medium text-[var(--muted)]">Gratuito</th>
                    <th className="bg-[color-mix(in_oklab,var(--primary)_6%,transparent)] px-3 py-3 font-semibold text-[var(--primary)]">Profissional</th>
                    <th className="px-3 py-3 font-medium text-[var(--muted)]">Enterprise</th>
                  </tr>
                </thead>
                <tbody>
                  {planMatrix.map((row, i) => (
                    <tr key={row.feature} className={i % 2 ? 'bg-[var(--bg-soft)]' : ''}>
                      <td className="px-5 py-3 text-left text-[var(--ink)]/85">{row.feature}</td>
                      <td className="px-3 py-3 text-center"><PlanCell v={row.free} /></td>
                      <td className="bg-[color-mix(in_oklab,var(--primary)_6%,transparent)] px-3 py-3 text-center font-medium"><PlanCell v={row.pro} /></td>
                      <td className="px-3 py-3 text-center"><PlanCell v={row.ent} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </section>

        {/* ── FAQ ────────────────────────────────────────────── */}
        <section id="faq" className="bg-[var(--bg-soft)] px-5 py-20 sm:px-8 sm:py-28">
          <div className="mx-auto max-w-3xl">
            <SectionHead kicker="Dúvidas" title="O que todo mundo pergunta" size="sm" />
            <div className="mt-12 space-y-3">
              {faqs.map((f) => (
                <details key={f.q} name="faq" className="rdr-faq group rounded-2xl border border-[var(--line)] bg-[var(--card)] px-5 shadow-sm">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-left font-semibold text-[var(--ink)]">
                    {f.q}
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-[var(--line)] text-[var(--primary)] transition-transform duration-300 group-open:rotate-45">
                      <Plus className="h-4 w-4" />
                    </span>
                  </summary>
                  <p className="rdr-faq-body pb-5 text-sm leading-relaxed text-[var(--muted)]">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ── CTA FINAL ──────────────────────────────────────── */}
        <section className="px-5 py-20 sm:px-8 sm:py-28">
          <div className="relative mx-auto max-w-5xl overflow-hidden rounded-[2.5rem] bg-[var(--primary)] px-6 py-20 text-center">
            <div className="pointer-events-none absolute inset-0 opacity-90 [background:radial-gradient(60%_120%_at_80%_-10%,rgba(6,182,212,0.55),transparent),radial-gradient(50%_120%_at_10%_110%,rgba(255,255,255,0.18),transparent)]" />
            <div className="relative">
              <h2 className="mx-auto max-w-2xl font-[family-name:var(--font-display)] text-3xl font-extrabold leading-[1.05] tracking-[-0.02em] text-white sm:text-5xl">
                Pare de perder cliente sem perceber.
              </h2>
              <p className="mx-auto mt-5 max-w-lg text-pretty text-white/85">
                Suba seu histórico de vendas e veja, em minutos, quanto há pra recuperar.
              </p>
              <div className="mt-9 flex justify-center">
                <Link href="/signup" className="group inline-flex items-center gap-2 rounded-full bg-white px-8 py-4 text-base font-semibold text-[var(--primary)] shadow-lg transition-transform hover:-translate-y-0.5">
                  Começar grátis
                  <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </Link>
              </div>
              <p className="mt-3 text-sm text-white/75">Sem cartão · 5 análises grátis.</p>
            </div>
          </div>
        </section>
      </main>

      {/* ── FOOTER ───────────────────────────────────────────── */}
      <footer className="border-t border-[var(--line)] px-5 py-12 sm:px-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 sm:flex-row">
          <Wordmark />
          <nav className="flex gap-6 text-sm text-[var(--muted)]">
            <Link href="/termos" className="hover:text-[var(--ink)]">Termos</Link>
            <Link href="/privacidade" className="hover:text-[var(--ink)]">Privacidade</Link>
            <a href="mailto:contato@radarcomercial.com.br" className="hover:text-[var(--ink)]">Contato</a>
          </nav>
        </div>
        <p className="mx-auto mt-8 max-w-6xl text-center text-xs text-[var(--faint)] sm:text-left">
          © 2026 Radar Comercial. Todos os direitos reservados.
        </p>
      </footer>
    </div>
  )
}

/* ── peças ────────────────────────────────────────────────────────── */

function Wordmark() {
  return (
    <Link href="/" className="inline-flex items-center gap-2">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--primary)] text-white shadow-sm">
        <Radar className="h-4 w-4" />
      </span>
      <span className="font-[family-name:var(--font-display)] text-lg font-extrabold tracking-[-0.02em] text-[var(--ink)]">
        Radar<span className="text-[var(--primary)]">.</span>
      </span>
    </Link>
  )
}

function CTA({ href, children, big, small }: { href: string; children: React.ReactNode; big?: boolean; small?: boolean }) {
  const size = big ? 'px-8 py-4 text-base' : small ? 'px-4 py-2 text-sm' : 'px-6 py-3 text-sm'
  return (
    <Link href={href} className={`group inline-flex items-center justify-center gap-2 rounded-full bg-[var(--primary)] font-semibold text-white shadow-[0_8px_24px_-8px_rgba(79,70,229,0.7)] transition-all hover:-translate-y-0.5 hover:shadow-[0_12px_32px_-8px_rgba(79,70,229,0.75)] ${size}`}>
      {children}
      <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
    </Link>
  )
}

function Kicker({ children }: { children: React.ReactNode }) {
  return <span className="rdr-reveal inline-block font-mono text-xs uppercase tracking-[0.2em] text-[var(--primary)]">{children}</span>
}

function SectionHead({ kicker, title, sub, size = 'lg' }: { kicker: string; title: string; sub?: string; size?: 'lg' | 'sm' }) {
  const h = size === 'lg' ? 'text-3xl font-extrabold tracking-[-0.03em] sm:text-4xl lg:text-5xl' : 'text-2xl font-bold tracking-[-0.02em] sm:text-3xl'
  return (
    <div className="mx-auto max-w-2xl text-center">
      <Kicker>{kicker}</Kicker>
      <h2 className={`rdr-reveal mt-3 font-[family-name:var(--font-display)] leading-[1.05] ${h}`}>{title}</h2>
      {sub && <p className="rdr-reveal mx-auto mt-4 max-w-xl text-[var(--muted)]">{sub}</p>}
    </div>
  )
}

function MarkCell({ v, highlight }: { v: Mark; highlight?: boolean }) {
  if (v === 'yes')
    return (
      <span className={`mx-auto grid h-7 w-7 place-items-center rounded-full ${highlight ? 'bg-[var(--primary)] text-white' : 'bg-[color-mix(in_oklab,var(--gain)_15%,transparent)] text-[var(--gain)]'}`}>
        <Check className="h-4 w-4" strokeWidth={3} />
      </span>
    )
  if (v === 'partial')
    return (
      <span className="mx-auto grid h-7 w-7 place-items-center rounded-full bg-[color-mix(in_oklab,var(--loss)_12%,transparent)] text-[var(--loss)]">
        <Minus className="h-4 w-4" strokeWidth={3} />
      </span>
    )
  return (
    <span className="mx-auto grid h-7 w-7 place-items-center rounded-full text-[var(--faint)]">
      <X className="h-4 w-4" strokeWidth={2.5} />
    </span>
  )
}

function PriceCard({ name, price, period, note, anchor, features, cta, featured }: {
  name: string; price: string; period?: string; note: string; anchor?: string; features: string[]; cta: string; featured?: boolean
}) {
  return (
    <div className={`rdr-reveal relative flex flex-col rounded-3xl border p-7 ${featured ? 'border-[var(--primary)]/40 bg-[var(--card)] shadow-[0_24px_60px_-30px_rgba(79,70,229,0.6)] lg:scale-[1.03]' : 'border-[var(--line)] bg-[var(--card)] shadow-sm'}`}>
      {featured && (
        <span className="absolute -top-3 left-7 rounded-full bg-[var(--primary)] px-3 py-1 text-xs font-semibold text-white">Mais popular</span>
      )}
      <h3 className="font-[family-name:var(--font-display)] text-lg font-bold">{name}</h3>
      <div className="mt-3 flex items-baseline gap-1.5">
        <span className="font-[family-name:var(--font-display)] text-4xl font-extrabold tabular-nums">{price}</span>
        {period && <span className="text-sm text-[var(--muted)]">{period}</span>}
      </div>
      <p className="mt-3 text-sm text-[var(--muted)]">{note}</p>
      {anchor && (
        <p className="mt-4 flex items-start gap-2 rounded-xl bg-[color-mix(in_oklab,var(--primary)_8%,transparent)] px-3 py-2 text-sm font-medium text-[var(--ink)]">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[var(--primary)]" />
          {anchor}
        </p>
      )}
      <ul className="mt-6 flex-1 space-y-3 text-sm">
        {features.map((f) => (
          <li key={f} className="flex items-center gap-2.5">
            <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-[color-mix(in_oklab,var(--gain)_16%,transparent)] text-[var(--gain)]">
              <Check className="h-2.5 w-2.5" strokeWidth={3.5} />
            </span>
            <span className="text-[var(--ink)]/85">{f}</span>
          </li>
        ))}
      </ul>
      <Link href="/signup" className={`mt-7 inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold transition-all ${featured ? 'bg-[var(--primary)] text-white shadow-[0_8px_24px_-8px_rgba(79,70,229,0.7)] hover:-translate-y-0.5' : 'border border-[var(--line)] text-[var(--ink)] hover:bg-[var(--bg-soft)]'}`}>
        {cta}
        <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  )
}

/* ── visuais de feature (mock, paleta clara) ──────────────────────── */

const riskRows = [
  { name: 'Padaria do Centro', days: 73, value: 'R$ 12.400', pct: 92 },
  { name: 'Mercearia União', days: 41, value: 'R$ 7.850', pct: 74 },
  { name: 'Auto Peças Ramos', days: 35, value: 'R$ 6.300', pct: 61 },
]

function RiskList() {
  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--card)] shadow-[0_30px_80px_-50px_rgba(14,18,32,0.5)]">
      <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-3.5">
        <span className="text-sm font-semibold text-[var(--ink)]">Clientes em risco</span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[color-mix(in_oklab,var(--loss)_12%,transparent)] px-2.5 py-0.5 text-xs font-medium text-[var(--loss)]">
          <TrendingDown className="h-3.5 w-3.5" /> <CountUp to={47} /> clientes
        </span>
      </div>
      <div className="divide-y divide-[var(--line)]">
        {riskRows.map((r) => (
          <div key={r.name} className="flex items-center gap-3 px-5 py-3.5">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--bg-soft)] text-xs font-semibold text-[var(--primary)]">{getInitials(r.name)}</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium text-[var(--ink)]">{r.name}</span>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-[var(--gain)]">{r.value}</span>
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--bg-soft)]">
                  <div className="h-full rounded-full bg-[var(--loss)]" style={{ width: `${r.pct}%` }} />
                </div>
                <span className="shrink-0 text-[11px] text-[var(--muted)]">{r.days}d inativo</span>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between bg-[var(--bg-soft)] px-5 py-3 text-sm">
        <span className="text-[var(--muted)]">Valor em risco</span>
        <span className="font-[family-name:var(--font-display)] font-bold text-[var(--ink)]"><CountUp to={426} prefix="R$ " suffix="K" /></span>
      </div>
    </div>
  )
}

function MessageMock() {
  return (
    <div className="mx-auto max-w-sm overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--card)] shadow-[0_30px_80px_-50px_rgba(14,18,32,0.5)]">
      <div className="flex items-center gap-2.5 border-b border-[var(--line)] px-4 py-3" style={{ background: 'color-mix(in oklab, var(--gain) 8%, transparent)' }}>
        <span className="grid h-8 w-8 place-items-center rounded-full bg-[var(--gain)] text-white"><MessageCircle className="h-4 w-4" /></span>
        <div>
          <div className="text-sm font-semibold text-[var(--ink)]">WhatsApp · do seu número</div>
          <div className="text-[11px] text-[var(--muted)]">para Padaria do Centro</div>
        </div>
      </div>
      <div className="space-y-3 p-4">
        <div className="rounded-2xl rounded-tl-sm bg-[var(--bg-soft)] p-3 text-sm leading-relaxed text-[var(--ink)]">
          Oi, João! Vi que faz um tempinho desde a última compra de fermento e farinha. Separei uma
          condição especial pra repor seu estoque essa semana — quer que eu envie?
          <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[color-mix(in_oklab,var(--primary)_10%,transparent)] px-2 py-0.5 text-[11px] font-medium text-[var(--primary)]">
            <Sparkles className="h-3 w-3" /> gerado por IA
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-[var(--line)] py-1.5 pl-4 pr-1.5">
          <span className="flex-1 text-sm text-[var(--muted)]">Revisar e enviar…</span>
          <span className="grid h-8 w-8 place-items-center rounded-full bg-[var(--gain)] text-white"><Send className="h-4 w-4" /></span>
        </div>
      </div>
    </div>
  )
}

function PlanCell({ v }: { v: boolean | string }) {
  if (v === true) return <Check className="mx-auto h-4 w-4 text-[var(--gain)]" strokeWidth={3} />
  if (v === false) return <X className="mx-auto h-4 w-4 text-[var(--faint)]" strokeWidth={2.5} />
  return <span className="text-[var(--ink)]/80">{v}</span>
}

function ChurnMini() {
  return (
    <div className="mt-5 flex h-16 items-end gap-1.5" aria-hidden="true">
      {[28, 40, 52, 68, 86].map((h, i) => (
        <div key={i} className="flex-1 rounded-t" style={{ height: `${h}%`, background: i >= 3 ? 'var(--loss)' : 'color-mix(in oklab, var(--primary) 55%, transparent)' }} />
      ))}
    </div>
  )
}

function AiMini() {
  return (
    <div className="mt-5 rounded-xl bg-[var(--bg-soft)] p-3 text-xs leading-relaxed text-[var(--muted)]" aria-hidden="true">
      “Oi, João! Vi que faz um tempo desde sua última compra…”
      <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-[color-mix(in_oklab,var(--primary)_10%,transparent)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--primary)]">
        <Sparkles className="h-2.5 w-2.5" /> IA
      </span>
    </div>
  )
}

/* ── estilos scoped da landing ────────────────────────────────────── */

function LandingStyles() {
  return (
    <style>{`
      .landing-2026 {
        --bg: #ffffff;
        --bg-soft: #f6f7fb;
        --ink: #0e1220;
        --muted: #565d70;
        --faint: #8a90a0;
        --primary: #4f46e5;
        --cyan: #06b6d4;
        --gain: #10b981;
        --loss: #ef4444;
        --line: rgba(14,18,32,0.10);
        --card: #ffffff;
      }
      .rdr-grad {
        background: linear-gradient(100deg, var(--primary), var(--cyan));
        -webkit-background-clip: text; background-clip: text; color: transparent;
      }
      .rdr-grid {
        background-image: linear-gradient(rgba(14,18,32,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(14,18,32,0.05) 1px, transparent 1px);
        background-size: 44px 44px;
        mask-image: radial-gradient(60% 70% at 50% 0%, black, transparent);
        -webkit-mask-image: radial-gradient(60% 70% at 50% 0%, black, transparent);
      }
      @keyframes rdrRise { from { opacity: 0; transform: translateY(20px) } to { opacity: 1; transform: none } }
      .rdr-rise { opacity: 0; animation: rdrRise .8s cubic-bezier(.2,.7,.2,1) forwards; }
      @keyframes rdrFaq { from { opacity: 0; transform: translateY(-6px) } to { opacity: 1; transform: none } }
      .rdr-faq[open] .rdr-faq-body { animation: rdrFaq .3s ease both; }
      .rdr-faq summary::-webkit-details-marker { display: none; }
      @supports (animation-timeline: view()) {
        .rdr-reveal {
          opacity: 0;
          animation: rdrRise .7s cubic-bezier(.2,.7,.2,1) both;
          animation-timeline: view();
          animation-range: entry 0% cover 22%;
          animation-delay: var(--d, 0ms);
        }
      }
      .landing-2026.rdr-js .rdr-reveal {
        opacity: 0; transform: translateY(20px);
        transition: opacity .65s cubic-bezier(.2,.7,.2,1), transform .65s cubic-bezier(.2,.7,.2,1);
        transition-delay: var(--d, 0ms);
      }
      .landing-2026.rdr-js .rdr-reveal.is-in { opacity: 1; transform: none; }
      .landing-2026 a:focus-visible, .landing-2026 summary:focus-visible {
        outline: 2px solid var(--primary); outline-offset: 3px; border-radius: 8px;
      }
      @media (prefers-reduced-motion: reduce) {
        .landing-2026 * { animation: none !important; transition: none !important; }
        .rdr-rise, .rdr-reveal { opacity: 1 !important; transform: none !important; }
      }
    `}</style>
  )
}
