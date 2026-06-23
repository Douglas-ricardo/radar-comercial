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
import { ProtectedRoute } from '@/lib/auth/protected-route'
import { PLAN_LIST, type PlanId } from '@/lib/plans'

const PLAN_ICONS: Record<PlanId, typeof Zap> = { free: Zap, pro: Users, enterprise: Crown }

// Planos exibidos vêm de PLAN_LIST (lib/plans.ts) — fonte única; ícones acima.

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
      <div className="flex-1 space-y-6 p-6 lg:p-8">

        {/* Confirmação de pagamento em sincronização */}
        {syncing && (
          <div
            className="flex items-center gap-3 rounded-2xl border border-primary bg-accent/40 p-4 text-sm text-foreground"
            role="status"
            aria-live="polite"
          >
            <Spinner className="h-4 w-4 text-primary" aria-hidden="true" />
            <span>Confirmando seu pagamento e atualizando o plano...</span>
          </div>
        )}

        {/* Plano atual + uso */}
        <Card className="rounded-2xl border border-border bg-card shadow-sm">
          <CardHeader>
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-1">
                <CardTitle className="flex items-center gap-2 font-[family-name:var(--font-display)] text-lg font-bold tracking-[-0.02em]">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent">
                    <TrendingUp className="h-4 w-4 text-primary" aria-hidden="true" />
                  </span>
                  Seu plano atual
                </CardTitle>
                <CardDescription>
                  {currentPlan === 'free'
                    ? 'Faça upgrade para destravar mais análises e usuários'
                    : 'Sua assinatura está ativa'}
                </CardDescription>
              </div>
              <Badge variant={currentPlan === 'free' ? 'secondary' : 'default'} className="rounded-full text-sm">
                {currentPlan === 'free' ? 'Gratuito' : currentPlan === 'pro' ? 'Profissional' : 'Enterprise'}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">Uploads este mês</span>
                <span className={cn('text-sm font-semibold tabular-nums', isNearLimit ? 'text-destructive' : 'text-foreground')}>
                  {company?.uploadsUsed ?? 0} / {company?.uploadsLimit ?? 0}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    'h-full rounded-full transition-all duration-500',
                    isNearLimit ? 'bg-destructive' : 'bg-primary',
                  )}
                  style={{ width: `${usage}%` }}
                />
              </div>
              {isNearLimit && (
                <p className="mt-2 text-xs text-destructive">
                  Você está próximo do limite. Considere fazer upgrade.
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Comparativo de planos */}
        <div>
          <h2 className="mb-4 font-[family-name:var(--font-display)] text-xl font-bold tracking-[-0.02em]">Planos disponíveis</h2>
          <div className="grid items-start gap-4 md:grid-cols-3">
            {PLAN_LIST.map((plan) => {
              const isCurrent = plan.id === currentPlan
              const isUpgrade = !isCurrent && plan.id !== 'free'
              const isLoading = upgradingTo === plan.id
              const Icon = PLAN_ICONS[plan.id]

              return (
                <Card
                  key={plan.id}
                  className={cn(
                    'relative flex flex-col rounded-2xl border border-border bg-card shadow-sm transition-shadow',
                    plan.popular && !isCurrent && 'border-primary/60 shadow-md',
                    isCurrent && 'border-primary bg-accent/40 shadow-md',
                  )}
                >
                  {plan.popular && !isCurrent && (
                    <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-0.5 text-xs font-semibold text-primary-foreground">
                      Mais popular
                    </span>
                  )}
                  {isCurrent && (
                    <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-0.5 text-xs font-semibold text-primary-foreground">
                      Plano atual
                    </span>
                  )}
                  <CardHeader>
                    <div className={cn(
                      'mb-2 flex h-10 w-10 items-center justify-center rounded-lg',
                      isCurrent || plan.popular ? 'bg-primary/10' : 'bg-secondary',
                    )}>
                      <Icon className={cn('h-5 w-5', isCurrent || plan.popular ? 'text-primary' : 'text-muted-foreground')} aria-hidden="true" />
                    </div>
                    <CardTitle className="font-[family-name:var(--font-display)] text-lg font-bold tracking-[-0.02em]">{plan.name}</CardTitle>
                    <div className="flex items-baseline gap-1">
                      <span className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-[-0.02em] tabular-nums">{plan.price}</span>
                      {plan.period && <span className="text-sm text-muted-foreground">{plan.period}</span>}
                    </div>
                    <CardDescription>{plan.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="flex-1">
                    <ul className="space-y-2.5">
                      {plan.features.map((feature) => (
                        <li key={feature} className="flex items-start gap-2 text-sm">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                          <span className="text-foreground">{feature}</span>
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
                        aria-busy={isLoading}
                      >
                        {isLoading && <Spinner className="mr-2 h-4 w-4" aria-hidden="true" />}
                        Fazer upgrade
                      </Button>
                    ) : (
                      <Button variant="ghost" className="w-full text-muted-foreground" disabled>
                        Downgrade indisponível
                      </Button>
                    )}
                  </CardFooter>
                </Card>
              )
            })}
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          Pagamentos processados de forma segura pelo Stripe. Cobrança por assento, sem fidelidade — cancele a qualquer momento.
        </p>
      </div>
    </div>
  )
}

export default function BillingPage() {
  return (
    <ProtectedRoute requiredRoles={['admin']}>
      <Suspense>
        <BillingContent />
      </Suspense>
    </ProtectedRoute>
  )
}
