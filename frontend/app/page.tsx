//app/page.tsx
import Link from 'next/link'
import { Logo } from '@/components/common/logo'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  ArrowRight,
  BarChart3,
  Upload,
  TrendingUp,
  Users,
  Shield,
  Zap,
  CheckCircle,
  Sparkles,
  Target,
  PieChart,
} from 'lucide-react'

function HeroIllustration() {
  return (
    <div className="relative mx-auto w-full max-w-lg">
      {/* Main card */}
      <div className="relative z-10 rounded-2xl border border-border bg-card p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full bg-destructive" />
            <span className="text-sm font-medium text-muted-foreground">Receita Perdida Detectada</span>
          </div>
          <Sparkles className="h-5 w-5 text-primary" />
        </div>
        <div className="font-serif text-4xl tabular-nums text-destructive">R$ 521.000</div>
        <p className="mt-1 text-sm text-muted-foreground">em oportunidades identificadas</p>
        
        <div className="mt-6 grid grid-cols-3 gap-4">
          <div className="rounded-lg bg-secondary/50 p-3 text-center">
            <div className="text-lg font-semibold text-foreground">47</div>
            <div className="text-xs text-muted-foreground">Clientes inativos</div>
          </div>
          <div className="rounded-lg bg-secondary/50 p-3 text-center">
            <div className="text-lg font-semibold text-foreground">23</div>
            <div className="text-xs text-muted-foreground">Produtos</div>
          </div>
          <div className="rounded-lg bg-secondary/50 p-3 text-center">
            <div className="text-lg font-semibold text-foreground">12</div>
            <div className="text-xs text-muted-foreground">Gaps sazonais</div>
          </div>
        </div>

        {/* Mini chart */}
        <div className="mt-6 flex items-end gap-1">
          {[40, 65, 45, 80, 55, 70, 90, 60, 75, 85, 95, 70].map((h, i) => (
            <div
              key={i}
              className="flex-1 rounded-t bg-primary/20"
              style={{ height: `${h}px` }}
            >
              <div 
                className="w-full rounded-t bg-primary transition-all"
                style={{ height: `${h * 0.6}px`, marginTop: `${h * 0.4}px` }}
              />
            </div>
          ))}
        </div>
      </div>
      
      {/* Floating cards */}
      <div className="absolute -left-8 top-1/4 z-0 animate-pulse rounded-xl border border-border bg-card p-4 shadow-lg">
        <div className="flex items-center gap-2">
          <Target className="h-5 w-5 text-success" />
          <span className="text-sm font-medium">+R$ 45K recuperavel</span>
        </div>
      </div>
      
      <div className="absolute -right-4 bottom-1/4 z-20 rounded-xl border border-border bg-card p-4 shadow-lg">
        <div className="flex items-center gap-2">
          <PieChart className="h-5 w-5 text-primary" />
          <span className="text-sm font-medium">18% do potencial</span>
        </div>
      </div>

      {/* Background decoration */}
      <div className="absolute -inset-4 -z-10 rounded-3xl bg-gradient-to-br from-primary/5 via-transparent to-destructive/5" />
    </div>
  )
}

const features = [
  {
    icon: Upload,
    title: 'Upload Simples',
    description: 'Faça upload dos seus dados de vendas em CSV ou Excel. Nosso sistema processa automaticamente.',
  },
  {
    icon: BarChart3,
    title: 'Análise Inteligente',
    description: 'Algoritmos avançados identificam padrões de compra e oportunidades perdidas.',
  },
  {
    icon: TrendingUp,
    title: 'Recupere Receita',
    description: 'Visualize exatamente quanto dinheiro está sendo deixado na mesa e como recuperá-lo.',
  },
  {
    icon: Users,
    title: 'Multi-tenant',
    description: 'Convide sua equipe e gerencie permissões. Cada empresa tem seus próprios dados isolados.',
  },
]

const benefits = [
  'Identifique clientes que pararam de comprar',
  'Descubra produtos com potencial inexplorado',
  'Analise padrões sazonais de vendas',
  'Receba alertas de oportunidades em tempo real',
  'Exporte relatórios profissionais em PDF',
  'API para integração com outros sistemas',
]

const stats = [
  { value: 'R$ 2M+', label: 'Receita recuperada' },
  { value: '500+', label: 'Empresas ativas' },
  { value: '15K+', label: 'Análises realizadas' },
  { value: '98%', label: 'Satisfação' },
]

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Logo size="md" />
          <nav className="hidden items-center gap-6 md:flex">
            <Link href="#features" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
              Recursos
            </Link>
            <Link href="#pricing" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
              Preços
            </Link>
            <a href="mailto:contato@radarcomercial.com.br" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
              Contato
            </a>
          </nav>
          <div className="flex items-center gap-4">
            <Link href="/login">
              <Button variant="ghost">Entrar</Button>
            </Link>
            <Link href="/signup">
              <Button>
                Começar grátis
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative overflow-hidden px-4 py-16 sm:px-6 sm:py-24 lg:px-8 lg:py-32">
          {/* Background decorations */}
          <div className="absolute inset-0 -z-10 overflow-hidden">
            <div className="absolute -left-1/4 top-0 h-96 w-96 rounded-full bg-primary/5 blur-3xl" />
            <div className="absolute -right-1/4 bottom-0 h-96 w-96 rounded-full bg-destructive/5 blur-3xl" />
          </div>

          <div className="mx-auto max-w-7xl">
            <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
              {/* Text content */}
              <div className="text-center lg:text-left">
                <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-secondary/50 px-4 py-1.5 text-sm">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <span className="text-muted-foreground">Inteligência comercial com IA</span>
                </div>
                <h1 className="text-balance font-serif text-4xl tracking-[-0.02em] text-foreground sm:text-5xl lg:text-6xl">
                  Descubra quanto dinheiro sua empresa está{' '}
                  <span className="italic text-primary">deixando na mesa</span>
                </h1>
                <p className="mt-6 text-pretty text-lg leading-8 text-muted-foreground">
                  O Radar Comercial analisa seus dados de vendas e identifica oportunidades perdidas.
                  Recupere receita, entenda padrões de compra e tome decisões baseadas em dados.
                </p>
                <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row lg:justify-start">
                  <Link href="/signup">
                    <Button size="lg" className="h-12 w-full px-8 sm:w-auto">
                      Começar gratuitamente
                      <ArrowRight className="ml-2 h-5 w-5" />
                    </Button>
                  </Link>
                  <Link href="/login">
                    <Button size="lg" variant="outline" className="h-12 w-full px-8 sm:w-auto">
                      Ver demonstração
                    </Button>
                  </Link>
                </div>

                {/* Stats inline */}
                <div className="mt-12 grid grid-cols-2 gap-6 sm:grid-cols-4 lg:mt-16">
                  {stats.map((stat) => (
                    <div key={stat.label} className="text-center lg:text-left">
                      <div className="font-serif text-2xl text-primary tabular-nums sm:text-3xl">{stat.value}</div>
                      <div className="mt-1 text-sm text-muted-foreground">{stat.label}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Illustration */}
              <div className="hidden lg:block">
                <HeroIllustration />
              </div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section id="features" className="border-t border-border bg-secondary/30 px-4 py-20 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="font-serif text-3xl tracking-[-0.02em] text-foreground sm:text-4xl">
                Tudo que você precisa para recuperar receita
              </h2>
              <p className="mt-4 text-lg text-muted-foreground">
                Uma plataforma completa para análise de vendas e identificação de oportunidades
              </p>
            </div>

            <div className="mx-auto mt-16 grid max-w-5xl gap-6 sm:grid-cols-2">
              {features.map((feature, index) => (
                <Card 
                  key={feature.title} 
                  className="group relative overflow-hidden border-border transition-all duration-300 hover:border-primary/50 hover:shadow-lg"
                >
                  <CardContent className="flex gap-4 p-6">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 transition-colors group-hover:bg-primary/20">
                      <feature.icon className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground">{feature.title}</h3>
                      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{feature.description}</p>
                    </div>
                  </CardContent>
                  <div className="absolute inset-x-0 bottom-0 h-0.5 bg-gradient-to-r from-transparent via-primary to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Benefits Section */}
        <section className="px-4 py-20 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
              <div>
                <h2 className="font-serif text-3xl tracking-[-0.02em] text-foreground sm:text-4xl">
                  Transforme dados em receita
                </h2>
                <p className="mt-4 text-lg text-muted-foreground">
                  Nosso algoritmo analisa seus históricos de vendas e identifica padrões que
                  indicam oportunidades perdidas. Você saberá exatamente quais clientes reconquistar
                  e quais produtos promover.
                </p>
                <ul className="mt-8 space-y-4">
                  {benefits.map((benefit) => (
                    <li key={benefit} className="flex items-center gap-3">
                      <CheckCircle className="h-5 w-5 shrink-0 text-success" />
                      <span className="text-foreground">{benefit}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex items-center justify-center">
                <div className="relative w-full max-w-md">
                  {/* Main card */}
                  <div className="rounded-2xl border border-border bg-card p-6 shadow-2xl">
                    <div className="mb-4 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 animate-pulse rounded-full bg-destructive" />
                        <span className="text-sm font-medium text-muted-foreground">Receita Perdida Detectada</span>
                      </div>
                      <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">-18%</span>
                    </div>
                    <div className="font-serif text-4xl tabular-nums text-destructive">R$ 521.000</div>
                    <p className="mt-2 text-sm text-muted-foreground">em oportunidades identificadas</p>
                    
                    <div className="mt-6 space-y-3">
                      <div className="flex items-center justify-between rounded-lg bg-secondary/50 p-3 text-sm">
                        <span className="text-muted-foreground">Clientes inativos</span>
                        <span className="font-semibold">47 clientes</span>
                      </div>
                      <div className="flex items-center justify-between rounded-lg bg-secondary/50 p-3 text-sm">
                        <span className="text-muted-foreground">Produtos sem giro</span>
                        <span className="font-semibold">23 produtos</span>
                      </div>
                      <div className="flex items-center justify-between rounded-lg bg-secondary/50 p-3 text-sm">
                        <span className="text-muted-foreground">Gaps sazonais</span>
                        <span className="font-semibold">12 periodos</span>
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div className="mt-6">
                      <div className="mb-2 flex justify-between text-xs">
                        <span className="text-muted-foreground">Potencial recuperavel</span>
                        <span className="font-medium text-success">82%</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-secondary">
                        <div className="h-full w-4/5 rounded-full bg-success" />
                      </div>
                    </div>
                  </div>

                  {/* Floating badge */}
                  <div className="absolute -right-4 -top-4 rounded-xl border border-border bg-card px-4 py-2 shadow-lg">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-success" />
                      <span className="text-sm font-medium">+R$ 427K recuperavel</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Pricing Section */}
        <section id="pricing" className="border-t border-border bg-secondary/30 px-4 py-20 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="font-serif text-3xl tracking-[-0.02em] text-foreground sm:text-4xl">
                Planos para todos os tamanhos
              </h2>
              <p className="mt-4 text-lg text-muted-foreground">
                Comece gratuitamente e escale conforme sua necessidade
              </p>
            </div>

            <div className="mx-auto mt-16 grid max-w-5xl gap-6 lg:grid-cols-3">
              {/* Free Plan */}
              <Card className="group relative overflow-hidden border-border transition-all duration-300 hover:border-primary/30 hover:shadow-lg">
                <CardContent className="p-6">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary transition-colors group-hover:bg-secondary/80">
                    <Zap className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <h3 className="mt-4 font-serif text-xl font-medium tracking-[-0.01em]">Gratuito</h3>
                  <div className="mt-2">
                    <span className="font-serif text-4xl tabular-nums">R$ 0</span>
                    <span className="text-muted-foreground">/mês</span>
                  </div>
                  <p className="mt-4 text-sm text-muted-foreground">
                    Perfeito para comecar a explorar
                  </p>
                  <ul className="mt-6 space-y-3 text-sm">
                    <li className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-success" />
                      <span>5 uploads por mês</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-success" />
                      <span>Análise básica</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-success" />
                      <span>1 usuário</span>
                    </li>
                  </ul>
                  <Link href="/signup" className="mt-6 block">
                    <Button variant="outline" className="w-full">
                      Começar grátis
                    </Button>
                  </Link>
                </CardContent>
              </Card>

              {/* Pro Plan */}
              <Card className="group relative overflow-hidden border-primary shadow-lg shadow-primary/10 transition-all duration-300 hover:shadow-xl hover:shadow-primary/20">
                <div className="absolute -top-px left-0 right-0 h-1 bg-primary" />
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="rounded-full bg-primary px-4 py-1 text-xs font-semibold text-primary-foreground shadow-lg">
                    Mais popular
                  </span>
                </div>
                <CardContent className="p-6 pt-8">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 transition-colors group-hover:bg-primary/20">
                    <Users className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="mt-4 font-serif text-xl font-medium tracking-[-0.01em]">Profissional</h3>
                  <div className="mt-2">
                    <span className="font-serif text-4xl tabular-nums">R$ 199</span>
                    <span className="text-muted-foreground">/mês</span>
                  </div>
                  <p className="mt-4 text-sm text-muted-foreground">
                    Para times em crescimento
                  </p>
                  <ul className="mt-6 space-y-3 text-sm">
                    <li className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-success" />
                      <span>50 uploads por mês</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-success" />
                      <span>Análise avançada com IA</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-success" />
                      <span>Até 10 usuários</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-success" />
                      <span>Suporte prioritário</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-success" />
                      <span>Exportação PDF</span>
                    </li>
                  </ul>
                  <Link href="/signup" className="mt-6 block">
                    <Button className="w-full shadow-lg shadow-primary/20">
                      Começar agora
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </Link>
                </CardContent>
              </Card>

              {/* Enterprise Plan */}
              <Card className="group relative overflow-hidden border-border transition-all duration-300 hover:border-primary/30 hover:shadow-lg">
                <CardContent className="p-6">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary">
                    <Shield className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <h3 className="mt-4 font-serif text-xl font-medium tracking-[-0.01em]">Enterprise</h3>
                  <div className="mt-2">
                    <span className="font-serif text-4xl">Sob consulta</span>
                  </div>
                  <p className="mt-4 text-sm text-muted-foreground">
                    Para grandes operacoes
                  </p>
                  <ul className="mt-6 space-y-3 text-sm">
                    <li className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-success" />
                      Uploads ilimitados
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-success" />
                      Análise customizada
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-success" />
                      Usuarios ilimitados
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-success" />
                      Suporte dedicado
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-success" />
                      API access + SSO
                    </li>
                  </ul>
                  <Link href="/signup" className="mt-6 block">
                    <Button variant="outline" className="w-full">
                      Falar com vendas
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="px-4 py-20 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-4xl text-center">
            <h2 className="font-serif text-3xl tracking-[-0.02em] text-foreground sm:text-4xl">
              Pronto para recuperar sua receita perdida?
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Comece gratuitamente e veja quanto dinheiro sua empresa está deixando na mesa.
            </p>
            <div className="mt-10 flex items-center justify-center gap-4">
              <Link href="/signup">
                <Button size="lg" className="h-12 px-8">
                  Criar conta gratuita
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-secondary/30 px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
            <Logo size="sm" />
            <nav className="flex gap-6">
              <Link href="/termos" className="text-sm text-muted-foreground hover:text-foreground">
                Termos de Uso
              </Link>
              <Link href="/privacidade" className="text-sm text-muted-foreground hover:text-foreground">
                Privacidade
              </Link>
              <a href="mailto:contato@radarcomercial.com.br" className="text-sm text-muted-foreground hover:text-foreground">
                Contato
              </a>
            </nav>
          </div>
          <p className="mt-8 text-center text-sm text-muted-foreground">
            2024 Radar Comercial. Todos os direitos reservados.
          </p>
        </div>
      </footer>
    </div>
  )
}
