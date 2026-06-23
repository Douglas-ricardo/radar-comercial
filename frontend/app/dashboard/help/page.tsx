'use client'

import Link from 'next/link'
import { DashboardHeader } from '@/components/dashboard/header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Upload, LineChart, Briefcase, Send, Plug2, ShieldCheck,
  Mail, FileText, ArrowRight,
} from 'lucide-react'

const STEPS = [
  {
    icon: Upload,
    title: '1. Importe suas vendas',
    body: 'Suba um CSV/XLSX de vendas (ou conecte uma integração). O Radar processa em segundo plano e avisa quando terminar.',
    href: '/dashboard/upload',
    cta: 'Importar dados',
  },
  {
    icon: LineChart,
    title: '2. Leia os insights',
    body: 'Veja receita perdida, clientes em risco e oportunidades de recuperação já qualificadas com histórico real.',
    href: '/dashboard/insights',
    cta: 'Ver insights',
  },
  {
    icon: Briefcase,
    title: '3. Trabalhe a carteira',
    body: 'Mova cada oportunidade pelo funil (a contatar → contatado → ganho/perdido) e acompanhe o ROI e o ranking do time.',
    href: '/dashboard/carteira',
    cta: 'Abrir carteira',
  },
  {
    icon: Send,
    title: '4. Reative com o Disparo',
    body: 'Conecte o WhatsApp do vendedor e envie mensagens geradas por IA para clientes inativos — sempre respeitando opt-out.',
    href: '/dashboard/disparo',
    cta: 'Configurar disparo',
  },
]

const FAQ = [
  {
    q: 'Que formato de arquivo posso enviar?',
    a: 'CSV ou XLSX com colunas de data, cliente, produto, quantidade e valor (e, opcionalmente, telefone/e-mail). Reconhecemos sinônimos em português e inglês automaticamente. O limite é de 50 MB por arquivo.',
  },
  {
    q: 'Vocês guardam minhas vendas brutas?',
    a: 'Não. O histórico é convertido em métricas agregadas e o arquivo de origem é apagado após o processamento (a menos que o reprocessamento esteja explicitamente habilitado). Guardamos telefone/e-mail dos clientes apenas quando você usa o Disparo.',
  },
  {
    q: 'Como funciona o opt-out no Disparo?',
    a: 'Respostas como “PARE” no WhatsApp ou o link de descadastro no e-mail registram um opt-out permanente, que sobrevive a novas importações. Você também pode marcar contatos manualmente na tela de Disparo.',
  },
  {
    q: 'O que cada papel (admin / analista / leitor) pode fazer?',
    a: 'Admin gerencia equipe, integrações e faturamento. Analista (o comercial) trabalha insights, carteira e disparo. Leitor visualiza insights e carteira, sem disparar ações.',
  },
  {
    q: 'Preciso de IA configurada para gerar mensagens?',
    a: 'A geração personalizada usa IA quando a chave está configurada no servidor. Sem ela, o Disparo usa um modelo padrão preenchido com os dados de cada cliente.',
  },
]

const RESOURCES = [
  { icon: Plug2, label: 'Integrações e API', href: '/dashboard/integrations' },
  { icon: ShieldCheck, label: 'Política de Privacidade', href: '/privacidade' },
  { icon: FileText, label: 'Termos de Uso', href: '/termos' },
]

export default function HelpPage() {
  return (
    <div className="flex flex-col">
      <DashboardHeader
        title="Central de ajuda"
        description="Como tirar o máximo do Radar Comercial"
      />

      <div className="flex-1 space-y-8 p-6 lg:p-8 max-w-[1100px] mx-auto w-full">
        {/* Primeiros passos */}
        <section className="space-y-4">
          <h2 className="font-[family-name:var(--font-display)] text-lg font-bold tracking-[-0.02em] text-foreground">
            Primeiros passos
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {STEPS.map((s) => (
              <Card key={s.title} className="flex flex-col rounded-2xl border-border shadow-sm">
                <CardHeader className="pb-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-primary">
                    <s.icon className="h-5 w-5" aria-hidden />
                  </div>
                  <CardTitle className="mt-3 font-[family-name:var(--font-display)] text-base font-bold tracking-[-0.02em]">
                    {s.title}
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col justify-between gap-4">
                  <p className="text-sm leading-relaxed text-muted-foreground">{s.body}</p>
                  <Link href={s.href} className="self-start">
                    <Button variant="ghost" size="sm" className="gap-1.5 text-primary hover:bg-accent hover:text-primary">
                      {s.cta}
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section className="space-y-4">
          <h2 className="font-[family-name:var(--font-display)] text-lg font-bold tracking-[-0.02em] text-foreground">
            Perguntas frequentes
          </h2>
          <div className="space-y-3">
            {FAQ.map((item) => (
              <Card key={item.q} className="rounded-2xl border-border shadow-sm">
                <CardContent className="p-5">
                  <p className="font-medium text-foreground">{item.q}</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{item.a}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Recursos + contato */}
        <section className="grid gap-4 lg:grid-cols-3">
          {RESOURCES.map((r) => (
            <Link key={r.href} href={r.href}>
              <Card className="rounded-2xl border-border shadow-sm transition-all hover:border-primary/30 hover:shadow-md">
                <CardContent className="flex items-center gap-3 p-5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-primary">
                    <r.icon className="h-4 w-4" aria-hidden />
                  </div>
                  <span className="text-sm font-medium text-foreground">{r.label}</span>
                  <ArrowRight className="ml-auto h-4 w-4 text-muted-foreground" aria-hidden />
                </CardContent>
              </Card>
            </Link>
          ))}
        </section>

        {/* Falar com suporte */}
        <Card className="rounded-2xl border border-primary/20 bg-accent/40 shadow-sm">
          <CardContent className="flex flex-wrap items-center justify-between gap-4 py-5">
            <div>
              <CardTitle className="font-[family-name:var(--font-display)] text-base font-bold tracking-[-0.02em]">
                Ainda precisa de ajuda?
              </CardTitle>
              <CardDescription className="mt-1">
                Fale com nosso time — respondemos em até 1 dia útil.
              </CardDescription>
            </div>
            <a href="mailto:contato@radarcomercial.com.br">
              <Button className="gap-2">
                <Mail className="h-4 w-4" aria-hidden />
                Falar com o suporte
              </Button>
            </a>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
