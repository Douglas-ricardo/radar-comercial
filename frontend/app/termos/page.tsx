import Link from 'next/link'
import { Logo } from '@/components/common/logo'
import { ArrowLeft } from 'lucide-react'

export const metadata = {
  title: 'Termos de Uso — Radar Comercial',
}

export default function TermosPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4 sm:px-6">
          <Link href="/"><Logo size="md" /></Link>
          <Link href="/" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <h1 className="text-3xl font-bold tracking-tight">Termos de Uso</h1>
        <p className="mt-2 text-sm text-muted-foreground">Última atualização: 16 de junho de 2026</p>

        <div className="mt-8 space-y-6 text-sm leading-relaxed text-muted-foreground">
          <section>
            <h2 className="text-lg font-semibold text-foreground">1. Aceitação dos termos</h2>
            <p className="mt-2">
              Ao criar uma conta e utilizar o Radar Comercial (&ldquo;Serviço&rdquo;), você concorda com estes
              Termos de Uso. Se você não concordar com qualquer parte destes termos, não utilize o Serviço.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">2. Descrição do serviço</h2>
            <p className="mt-2">
              O Radar Comercial processa o histórico de vendas enviado pela sua empresa para gerar insights
              de receita, identificação de clientes inativos e oportunidades de recuperação. Os dados são
              processados de forma agregada — não armazenamos transações brutas individuais.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">3. Conta e responsabilidades</h2>
            <p className="mt-2">
              Você é responsável por manter a confidencialidade das credenciais de acesso e por toda a
              atividade realizada na sua conta. Notifique-nos imediatamente sobre qualquer uso não autorizado.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">4. Planos e pagamento</h2>
            <p className="mt-2">
              Os planos pagos são cobrados por assinatura via Stripe. Os limites de uso de cada plano estão
              descritos na página de planos. O cancelamento pode ser solicitado a qualquer momento.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">5. Limitação de responsabilidade</h2>
            <p className="mt-2">
              O Serviço é fornecido &ldquo;como está&rdquo;. Os insights são apoios à decisão comercial e não
              constituem garantia de resultado. Não nos responsabilizamos por decisões tomadas com base nas
              análises geradas.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">6. Contato</h2>
            <p className="mt-2">
              Dúvidas sobre estes termos? Escreva para{' '}
              <a href="mailto:contato@radarcomercial.com.br" className="text-foreground underline">
                contato@radarcomercial.com.br
              </a>.
            </p>
          </section>
        </div>
      </main>
    </div>
  )
}
