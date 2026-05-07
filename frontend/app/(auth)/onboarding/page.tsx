//app/(auth)/onboarding/page.tsx
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth/auth-context'
import { api } from '@/lib/api/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Spinner } from '@/components/ui/spinner'
import { CheckCircle, Building2, Users, Zap, Crown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

type Step = 'company' | 'industry' | 'plan'

const STEPS: Step[] = ['company', 'industry', 'plan']

const industries = [
  'Varejo',
  'Indústria',
  'Serviços',
  'Tecnologia',
  'Saúde',
  'Educação',
  'Financeiro',
  'Outro',
]

const employeeCounts = ['1-10', '11-50', '51-200', '201-500', '500+']

const plans = [
  {
    id: 'free' as const,
    name: 'Gratuito',
    price: 'R$ 0',
    period: '/mês',
    description: 'Para começar a explorar',
    features: ['5 uploads/mês', 'Análise básica', '1 usuário', 'Suporte por email'],
    icon: Zap,
    popular: false,
  },
  {
    id: 'pro' as const,
    name: 'Profissional',
    price: 'R$ 199',
    period: '/mês',
    description: 'Para times em crescimento',
    features: [
      '50 uploads/mês',
      'Análise avançada',
      'Até 10 usuários',
      'Suporte prioritário',
      'Exportação PDF',
    ],
    icon: Users,
    popular: true,
  },
  {
    id: 'enterprise' as const,
    name: 'Enterprise',
    price: 'Personalizado',
    period: '',
    description: 'Para grandes operações',
    features: [
      'Uploads ilimitados',
      'Análise customizada',
      'Usuários ilimitados',
      'Suporte dedicado',
      'API access',
      'SSO',
    ],
    icon: Crown,
    popular: false,
  },
]

export default function OnboardingPage() {
  const [step, setStep] = useState<Step>('company')
  const [isLoading, setIsLoading] = useState(false)
  const [formData, setFormData] = useState({
    companyName: '',
    cnpj: '',
    industry: '',
    employeeCount: '',
    plan: 'free' as 'free' | 'pro' | 'enterprise',
  })

  const { company, updateCompany } = useAuth()
  const router = useRouter()

  // Pre-populate company name from auth context once it loads
  useEffect(() => {
    if (company?.name && !formData.companyName) {
      setFormData((prev) => ({ ...prev, companyName: company.name }))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company?.name])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const handleSelect = (field: keyof typeof formData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const handleNext = () => {
    const idx = STEPS.indexOf(step)
    if (idx < STEPS.length - 1) setStep(STEPS[idx + 1])
  }

  const handleBack = () => {
    const idx = STEPS.indexOf(step)
    if (idx > 0) setStep(STEPS[idx - 1])
  }

  const handleComplete = async () => {
    if (!company?.id) return
    setIsLoading(true)
    try {
      // Persist company name/cnpj if the user updated them during onboarding
      const nameChanged = formData.companyName && formData.companyName !== company.name
      const cnpjChanged = formData.cnpj

      if (nameChanged || cnpjChanged) {
        const res = await api.company.update(company.id, {
          name: formData.companyName || company.name,
          ...(formData.cnpj ? { cnpj: formData.cnpj } : {}),
        })
        if (res.success && res.data) {
          updateCompany({ name: res.data.name })
        }
      }

      if (formData.plan === 'free') {
        router.push('/dashboard')
        return
      }

      // Paid plan — initiate Stripe checkout
      const checkoutRes = await api.billing.createCheckoutSession(
        formData.plan as 'pro' | 'enterprise'
      )
      if (checkoutRes.success && checkoutRes.data?.url) {
        window.location.href = checkoutRes.data.url
      } else {
        // Stripe not configured yet — go to dashboard and upgrade from settings
        toast.error(checkoutRes.error ?? 'Checkout indisponível. Você pode fazer upgrade em Configurações.')
        router.push('/dashboard')
      }
    } catch {
      toast.error('Erro ao finalizar configuração. Tente novamente.')
    } finally {
      setIsLoading(false)
    }
  }

  const currentIdx = STEPS.indexOf(step)

  return (
    <div className="w-full max-w-2xl">
      {/* Indicador de progresso */}
      <nav aria-label="Etapas do cadastro" className="mb-8">
        <ol className="flex items-center justify-center gap-4">
          {STEPS.map((s, index) => {
            const isCompleted = currentIdx > index
            const isCurrent = step === s
            return (
              <li key={s} className="flex items-center">
                <div
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-colors',
                    isCompleted
                      ? 'bg-success text-success-foreground'
                      : isCurrent
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary text-muted-foreground'
                  )}
                  aria-current={isCurrent ? 'step' : undefined}
                >
                  {isCompleted ? (
                    <CheckCircle className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <span aria-hidden="true">{index + 1}</span>
                  )}
                  <span className="sr-only">
                    {isCompleted ? 'Concluído' : isCurrent ? 'Atual' : 'Pendente'}:{' '}
                    {s === 'company' ? 'Empresa' : s === 'industry' ? 'Setor' : 'Plano'}
                  </span>
                </div>
                {index < STEPS.length - 1 && (
                  <div
                    className={cn(
                      'ml-4 h-0.5 w-12 transition-colors',
                      isCompleted ? 'bg-success' : 'bg-secondary'
                    )}
                    aria-hidden="true"
                  />
                )}
              </li>
            )
          })}
        </ol>
      </nav>

      {/* Etapa 1 — Empresa */}
      {step === 'company' && (
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <Building2 className="h-6 w-6 text-primary" aria-hidden="true" />
            </div>
            <CardTitle className="text-2xl">Sobre sua empresa</CardTitle>
            <CardDescription>
              Conte-nos um pouco sobre sua empresa para personalizar sua experiência
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="companyName">Nome da empresa</FieldLabel>
                <Input
                  id="companyName"
                  name="companyName"
                  placeholder="Empresa Ltda"
                  value={formData.companyName}
                  onChange={handleChange}
                  required
                  autoComplete="organization"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="cnpj">CNPJ (opcional)</FieldLabel>
                <Input
                  id="cnpj"
                  name="cnpj"
                  placeholder="00.000.000/0001-00"
                  value={formData.cnpj}
                  onChange={handleChange}
                />
              </Field>
            </FieldGroup>
            <Button
              onClick={handleNext}
              className="w-full"
              disabled={!formData.companyName.trim()}
            >
              Continuar
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Etapa 2 — Setor */}
      {step === 'industry' && (
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Setor e tamanho</CardTitle>
            <CardDescription>
              Isso nos ajuda a otimizar as análises para seu tipo de negócio
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <fieldset>
              <legend className="text-sm font-medium mb-3">Setor de atuação</legend>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="group">
                {industries.map((industry) => (
                  <button
                    key={industry}
                    type="button"
                    onClick={() => handleSelect('industry', industry)}
                    aria-pressed={formData.industry === industry}
                    className={cn(
                      'rounded-md border px-4 py-2 text-sm font-medium transition-colors',
                      formData.industry === industry
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border hover:border-primary/50 hover:bg-secondary'
                    )}
                  >
                    {industry}
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend className="text-sm font-medium mb-3">Número de funcionários</legend>
              <div className="flex flex-wrap gap-2" role="group">
                {employeeCounts.map((count) => (
                  <button
                    key={count}
                    type="button"
                    onClick={() => handleSelect('employeeCount', count)}
                    aria-pressed={formData.employeeCount === count}
                    className={cn(
                      'rounded-md border px-4 py-2 text-sm font-medium transition-colors',
                      formData.employeeCount === count
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border hover:border-primary/50 hover:bg-secondary'
                    )}
                  >
                    {count}
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="flex gap-3">
              <Button variant="outline" onClick={handleBack} className="flex-1">
                Voltar
              </Button>
              <Button
                onClick={handleNext}
                className="flex-1"
                disabled={!formData.industry || !formData.employeeCount}
              >
                Continuar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Etapa 3 — Plano */}
      {step === 'plan' && (
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Escolha seu plano</CardTitle>
            <CardDescription>Você pode alterar seu plano a qualquer momento</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-3" role="radiogroup" aria-label="Planos disponíveis">
              {plans.map((plan) => (
                <button
                  key={plan.id}
                  type="button"
                  role="radio"
                  aria-checked={formData.plan === plan.id}
                  onClick={() => handleSelect('plan', plan.id)}
                  className={cn(
                    'relative flex flex-col rounded-lg border p-4 text-left transition-colors',
                    formData.plan === plan.id
                      ? 'border-primary bg-primary/5 ring-2 ring-primary'
                      : 'border-border hover:border-primary/50'
                  )}
                >
                  {plan.popular && (
                    <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-0.5 text-xs font-medium text-primary-foreground">
                      Popular
                    </span>
                  )}
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-secondary">
                    <plan.icon className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                  </div>
                  <h3 className="font-semibold">{plan.name}</h3>
                  <div className="mt-1">
                    <span className="text-2xl font-bold">{plan.price}</span>
                    <span className="text-sm text-muted-foreground">{plan.period}</span>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{plan.description}</p>
                  <ul className="mt-4 space-y-2" aria-label={`Recursos do plano ${plan.name}`}>
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-center gap-2 text-sm">
                        <CheckCircle className="h-4 w-4 text-success shrink-0" aria-hidden="true" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </button>
              ))}
            </div>

            <div className="flex gap-3">
              <Button variant="outline" onClick={handleBack} className="flex-1">
                Voltar
              </Button>
              <Button onClick={handleComplete} className="flex-1" disabled={isLoading} aria-busy={isLoading}>
                {isLoading ? (
                  <>
                    <Spinner className="mr-2 h-4 w-4" aria-hidden="true" />
                    Finalizando...
                  </>
                ) : (
                  'Começar a usar'
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
