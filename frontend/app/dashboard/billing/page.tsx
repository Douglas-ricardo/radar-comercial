'use client'

import { Suspense, useState, useEffect } from 'react'
import { useAuth } from '@/lib/auth/auth-context'
import { useSearchParams, useRouter } from 'next/navigation'
import { DashboardHeader } from '@/components/dashboard/header'
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { CheckCircle2, Crown, Zap, Users, TrendingUp } from 'lucide-react'
import { api } from '@/lib/api/client'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

type PlanId = 'free' | 'pro' | 'enterprise'

const PLANS = [
  {
    id: 'free' as PlanId,
    name: 'Gratuito',
    price: 'R$ 0',
    period: '/mês',
    description: 'Para começar a explorar',
    icon: Zap,
    features: ['5 uploads/mês', 'Análise básica', '1 usuário', 'Suporte por email'],
  },
  {
    id: 'pro' as PlanId,
    name: 'Profissional',
    price: 'R$ 497',
    period: '/mês',
    description: 'Para times em crescimento',
    icon: Users,
    features: [
      '50 uploads/mês',
      'Análise avançada',
      'Até 10 usuários',
      'Notificações WhatsApp',
      'API de ingestão',
      'Suporte prioritário',
    ],
    popular: true,
  },
  {
    id: 'enterprise' as PlanId,
    name: 'Enterprise',
    price: 'R$ 1.497',
    period: '/mês',
    description: 'Para grandes operações',
    icon: Crown,
    features: [
      'Uploads ilimitados',
      'Usuários ilimitados',
      'Conectores ERP via n8n',
      'SLA dedicado',
      'Onboarding assistido',
      'SSO',
    ],
  },
]

function BillingContent() {
  const { company, updateCompany } = useAuth()
  const router = useRouter()
  const [upgradingTo, setUpgradingTo] = useState<PlanId | null>(null)
  const [syncing, setSyncing] = useState(false)
  const searchParams = useSearchParams()

  useEffect(() => {
    if (searchParams.get('upgraded') === '1') {
      setSyncing(true)
      api.billing.syncPlan()
        .then((res) => {
          if (res.success && res.data) {
            updateCompany({ plan: res.data.plan as PlanId, uploadsLimit: res.data.uploadsLimit })
            toast.success('Plano atualizado com sucesso!')
          } else {
            toast.success('Pagamento confirmado! Recarregue a página para ver o novo plano.')
          }
        })
        .catch(() => {
          toast.success('Pagamento confirmado! Recarregue a página para ver o novo plano.')
        })
        .finally(() => {
          setSyncing(false)
          router.replace('/dashboard/billing')
        })
    } else if (searchParams.get('cancelled') === '1') {
      toast.info('Upgrade cancelado.')
      router.replace('/dashboard/billing')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const currentPlan = company?.plan ?? 'free'
  const usage = company ? Math.min((company.uploadsUsed / company.uploadsLimit) * 100, 100) : 0
  const isNearLimit = usage > 80

  const handleUpgrade = async (plan: PlanId) => {
    if (plan === 'free' || plan === currentPlan) return
    setUpgradingTo(plan)
    try {
      const res = await api.billing.createCheckoutSession(plan)
      if (res.success && res.data?.url) {
        window.location.href = res.data.url
      } else {
        toast.error(res.error ?? 'Erro ao iniciar checkout. Stripe pode não estar configurado.')
      }
    } catch {
      toast.error('Erro de conexão.')
    } finally {
      setUpgradingTo(null)
    }
  }

  return (
    <div className="flex flex-col">
      <DashboardHeader
        title="Plano e faturamento"
        description="Gerencie sua assinatura e veja o uso atual"
      />
      <div className="flex-1 p-6 space-y-6">

        {/* Plano atual + uso */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Seu plano atual
                </CardTitle>
                <CardDescription>
                  {currentPlan === 'free'
                    ? 'Faça upgrade para destravar mais uploads e usuários'
                    : 'Sua assinatura está ativa'}
                </CardDescription>
              </div>
              <Badge variant={currentPlan === 'free' ? 'secondary' : 'default'} className="text-sm">
                {currentPlan === 'free' ? 'Gratuito' : currentPlan === 'pro' ? 'Profissional' : 'Enterprise'}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Uploads este mês</span>
                <span className={cn('text-sm font-semibold', isNearLimit && 'text-destructive')}>
                  {company?.uploadsUsed ?? 0} / {company?.uploadsLimit ?? 0}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    'h-full transition-all duration-500',
                    isNearLimit ? 'bg-destructive' : 'bg-primary',
                  )}
                  style={{ width: `${usage}%` }}
                />
              </div>
              {isNearLimit && (
                <p className="text-xs text-destructive mt-2">
                  Você está próximo do limite. Considere fazer upgrade.
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Comparativo de planos */}
        <div>
          <h2 className="text-xl font-semibold mb-4">Planos disponíveis</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {PLANS.map((plan) => {
              const isCurrent = plan.id === currentPlan
              const isUpgrade = !isCurrent && plan.id !== 'free'
              const isLoading = upgradingTo === plan.id

              return (
                <Card
                  key={plan.id}
                  className={cn(
                    'relative flex flex-col',
                    plan.popular && 'border-primary ring-1 ring-primary/40',
                    isCurrent && 'border-green-500/50 bg-green-50/30',
                  )}
                >
                  {plan.popular && !isCurrent && (
                    <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-0.5 text-xs font-medium text-primary-foreground">
                      Popular
                    </span>
                  )}
                  {isCurrent && (
                    <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-green-600 px-3 py-0.5 text-xs font-medium text-white">
                      Plano atual
                    </span>
                  )}
                  <CardHeader>
                    <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-secondary">
                      <plan.icon className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                    </div>
                    <CardTitle>{plan.name}</CardTitle>
                    <div>
                      <span className="text-2xl font-bold">{plan.price}</span>
                      <span className="text-sm text-muted-foreground">{plan.period}</span>
                    </div>
                    <CardDescription>{plan.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="flex-1">
                    <ul className="space-y-2">
                      {plan.features.map((feature) => (
                        <li key={feature} className="flex items-start gap-2 text-sm">
                          <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0 mt-0.5" aria-hidden="true" />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                  <CardFooter>
                    {isCurrent ? (
                      <Button variant="outline" className="w-full" disabled>
                        Plano atual
                      </Button>
                    ) : isUpgrade ? (
                      <Button
                        className="w-full"
                        onClick={() => handleUpgrade(plan.id)}
                        disabled={isLoading}
                        variant={plan.popular ? 'default' : 'outline'}
                      >
                        {isLoading && <Spinner className="mr-2 h-4 w-4" />}
                        Fazer upgrade
                      </Button>
                    ) : (
                      <Button variant="outline" className="w-full" disabled>
                        Downgrade indisponível
                      </Button>
                    )}
                  </CardFooter>
                </Card>
              )
            })}
          </div>
        </div>

        <p className="text-xs text-center text-muted-foreground">
          Pagamentos processados de forma segura pelo Stripe. Cancele a qualquer momento.
        </p>
      </div>
    </div>
  )
}

export default function BillingPage() {
  return (
    <Suspense>
      <BillingContent />
    </Suspense>
  )
}
