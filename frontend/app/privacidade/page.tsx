import Link from 'next/link'
import { Logo } from '@/components/common/logo'
import { ArrowLeft } from 'lucide-react'

export const metadata = {
  title: 'Política de Privacidade — Radar Comercial',
}

export default function PrivacidadePage() {
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
        <h1 className="text-3xl font-bold tracking-tight">Política de Privacidade</h1>
        <p className="mt-2 text-sm text-muted-foreground">Última atualização: 22 de junho de 2026</p>

        <div className="mt-8 space-y-6 text-sm leading-relaxed text-muted-foreground">
          <section>
            <h2 className="text-lg font-semibold text-foreground">1. Dados que coletamos</h2>
            <p className="mt-2">
              Coletamos dados de cadastro (nome, e-mail, empresa) e o histórico de vendas que você envia para
              processamento. Em conformidade com a LGPD, o histórico é convertido em métricas agregadas — não
              persistimos as transações brutas individuais após o processamento.
            </p>
            <p className="mt-2">
              Quando você ativa o Disparo (reativação de clientes), também armazenamos os dados de contato
              (telefone e e-mail) dos seus clientes finais que você nos fornece, pois são necessários para
              enviar as mensagens em nome da sua empresa.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">2. Como usamos os dados</h2>
            <p className="mt-2">
              Os dados são utilizados exclusivamente para gerar os insights, oportunidades, notificações e
              disparos do Serviço para a sua empresa. Não vendemos nem compartilhamos seus dados com terceiros
              para fins de marketing.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">3. Comunicação com clientes finais e opt-out</h2>
            <p className="mt-2">
              O Disparo envia mensagens de WhatsApp e e-mail aos seus clientes finais em nome da sua empresa.
              Nesse fluxo, a sua empresa é a controladora desses dados e o Radar Comercial atua como operador.
              Respeitamos pedidos de descadastro: respostas como “PARE” no WhatsApp ou o link de descadastro no
              e-mail registram um opt-out permanente, que sobrevive a novas importações. Você também pode marcar
              um contato como opt-out e solicitar a exclusão dos dados pessoais de um cliente a qualquer momento.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">4. Compartilhamento com operadores</h2>
            <p className="mt-2">
              Utilizamos provedores de infraestrutura que atuam como operadores sob contrato, processando
              informações apenas para viabilizar o Serviço — entre eles: banco de dados e cache, envio de e-mail,
              provedores de mensageria (WhatsApp) e geração de mensagens por inteligência artificial. Esses
              operadores processam os dados estritamente conforme nossas instruções.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">5. Segurança</h2>
            <p className="mt-2">
              Adotamos medidas técnicas como criptografia de senhas, cookies httpOnly, isolamento por empresa
              (multi-tenancy) e controle de acesso por função. Nenhum sistema é totalmente imune a riscos, mas
              trabalhamos continuamente para protegê-los.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">6. Seus direitos (LGPD)</h2>
            <p className="mt-2">
              Você pode solicitar acesso, correção ou exclusão dos seus dados pessoais — e dos dados de contato
              dos seus clientes finais — a qualquer momento. Para exercer seus direitos, entre em contato pelo
              e-mail abaixo.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">7. Contato</h2>
            <p className="mt-2">
              Encarregado de dados:{' '}
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
