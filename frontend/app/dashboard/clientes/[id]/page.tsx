// app/dashboard/clientes/[id]/page.tsx
'use client'

import { use } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, TrendingUp, TrendingDown, Minus,
  AlertTriangle, ShoppingBag, ChevronRight,
} from 'lucide-react'
import {
  AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts'

import { useAuth }            from '@/lib/auth/auth-context'
import { useCustomerDetail }  from '@/hooks/use-customer-detail'
import { formatCurrency }     from '@/lib/format'
import { cn }                 from '@/lib/utils'

import { Button }             from '@/components/ui/button'
import { Badge }              from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton }           from '@/components/ui/skeleton'

import { ErrorState }         from '@/components/insights/error-state'
import { EmptyState }         from '@/components/insights/empty-state'
import { ChartTooltip }       from '@/components/insights/chart-tooltip'
import type { CustomerAlert, CustomerRFV } from '@/types/customer'

// ─── Constantes ───────────────────────────────────────────────────────────────

const ALERT_TYPE_LABELS: Record<CustomerAlert['type'], string> = {
  missing_sale:       'Venda perdida',
  declining_customer: 'Cliente em queda',
  seasonal_gap:       'Gap sazonal',
  product_gap:        'Gap de produto',
}

const CONFIDENCE_CONFIG = {
  high:   { className: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300', label: 'Alta' },
  medium: { className: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',         label: 'Média' },
  low:    { className: 'bg-muted text-muted-foreground',                                            label: 'Baixa' },
} as const

const RFV_SEGMENT_CONFIG: Record<CustomerRFV['segment'], { label: string; className: string; description: string }> = {
  champion: {
    label: 'Campeão',
    className: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
    description: 'Compra com frequência, alto valor, recente.',
  },
  loyal: {
    label: 'Fiel',
    className: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
    description: 'Alta frequência e valor consistente.',
  },
  at_risk: {
    label: 'Em risco',
    className: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
    description: 'Comprou bem, mas está sumindo.',
  },
  lost: {
    label: 'Perdido',
    className: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
    description: 'Sem compras há muito tempo.',
  },
  new: {
    label: 'Novo',
    className: 'bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300',
    description: 'Primeira ou segunda compra recente.',
  },
}

const RFV_SCORE_COLORS = ['#e5e7eb','#fbbf24','#f97316','#10b981','#059669']

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function SectionTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <span className="text-muted-foreground">{icon}</span>
      <h2 className="text-sm font-medium text-foreground">{children}</h2>
    </div>
  )
}

function RfvScoreDots({ score }: { score: 1|2|3|4|5 }) {
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: 5 }).map((_, i) => (
        <span
          key={i}
          className="inline-block h-2 w-2 rounded-full"
          style={{ backgroundColor: i < score ? RFV_SCORE_COLORS[score - 1] : '#e5e7eb' }}
        />
      ))}
    </div>
  )
}

function RfvBlock({ rfv }: { rfv: CustomerRFV }) {
  const segment = RFV_SEGMENT_CONFIG[rfv.segment]

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-sm font-medium">Métricas RFV</CardTitle>
            <CardDescription className="text-xs mt-0.5">Recência · Frequência · Valor</CardDescription>
          </div>
          <Badge className={cn('text-xs font-medium border-0', segment.className)}>
            {segment.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground leading-relaxed">{segment.description}</p>
        <div className="space-y-3">
          {([
            { label: 'Recência',   value: `${rfv.recency} dias`,     score: rfv.recencyScore   },
            { label: 'Frequência', value: `${rfv.frequency} compras`, score: rfv.frequencyScore },
            { label: 'Valor',      value: formatCurrency(rfv.value),  score: rfv.valueScore     },
          ] as const).map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{row.label}</p>
                <p className="text-sm font-medium truncate">{row.value}</p>
              </div>
              <RfvScoreDots score={row.score} />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function PageSkeleton() {
  return (
    <div className="space-y-8 p-6 md:p-8 max-w-[1200px] mx-auto w-full">
      <div className="flex items-center gap-3">
        <Skeleton className="h-8 w-8 rounded" />
        <Skeleton className="h-6 w-48" />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2"><Skeleton className="h-3 w-24" /></CardHeader>
            <CardContent><Skeleton className="h-7 w-32" /></CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl lg:col-span-2" />
      </div>
    </div>
  )
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const { company } = useAuth()
  const router      = useRouter()

  const { data, isLoading, error, refetch } = useCustomerDetail(company?.id, id)

  if (isLoading) return <PageSkeleton />

  if (error) {
    return (
      <div className="flex flex-col min-h-screen items-center justify-center">
        <ErrorState message={error} onRetry={refetch} />
      </div>
    )
  }

  if (!data) return null

  const trendIcon =
    data.trend === 'up'   ? <TrendingUp   className="h-4 w-4 text-emerald-500" /> :
    data.trend === 'down' ? <TrendingDown className="h-4 w-4 text-destructive" /> :
                            <Minus        className="h-4 w-4 text-muted-foreground" />

  return (
    <div className="flex flex-col min-h-screen">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="border-b border-border bg-background sticky top-0 z-10">
        <div className="max-w-[1200px] mx-auto w-full px-6 md:px-8 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={() => router.back()}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>

            <nav className="flex items-center gap-1.5 text-sm min-w-0" aria-label="Navegação">
              <button
                onClick={() => router.push('/dashboard/insights')}
                className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
              >
                Insights
              </button>
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground shrink-0">Clientes</span>
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="font-medium text-foreground truncate">{data.name}</span>
            </nav>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {trendIcon}
            <Badge className={cn('text-xs border-0', RFV_SEGMENT_CONFIG[data.rfv.segment].className)}>
              {RFV_SEGMENT_CONFIG[data.rfv.segment].label}
            </Badge>
          </div>
        </div>
      </div>

      {/* ── Conteúdo ────────────────────────────────────────────────────────── */}
      <div className="flex-1 p-6 md:p-8 max-w-[1200px] mx-auto w-full space-y-8">

        <div>
          <h1 className="text-xl font-semibold tracking-tight">{data.name}</h1>
          {data.document && (
            <p className="text-sm text-muted-foreground mt-0.5">{data.document}</p>
          )}
        </div>

        {/* ── KPIs ──────────────────────────────────────────────────────────── */}
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader className="pb-2 space-y-0">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Receita total
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold tracking-tight">{formatCurrency(data.totalRevenue)}</p>
              <p className="text-xs text-muted-foreground mt-1">{data.percentage}% da receita da empresa</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2 space-y-0">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Última compra
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold tracking-tight">{data.rfv.recency}d atrás</p>
              <p className="text-xs text-muted-foreground mt-1">
                {data.rfv.recency <= 30  ? 'Ativo recentemente' :
                 data.rfv.recency <= 90  ? 'Atenção recomendada' :
                                           'Risco de perda'}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2 space-y-0">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Frequência
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold tracking-tight">{data.rfv.frequency} compras</p>
              <p className="text-xs text-muted-foreground mt-1">no período analisado</p>
            </CardContent>
          </Card>
        </div>

        {/* ── RFV + Gráfico de receita ─────────────────────────────────────── */}
        <div className="grid gap-6 lg:grid-cols-3">
          <RfvBlock rfv={data.rfv} />

          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Evolução de receita</CardTitle>
              <CardDescription className="text-xs">Histórico mensal de compras</CardDescription>
            </CardHeader>
            <CardContent>
              {data.revenueHistory.length === 0 ? (
                <EmptyState
                  title="Sem histórico suficiente"
                  description="São necessários pelo menos 2 meses de compras para gerar o gráfico."
                />
              ) : (
                <div className="h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={data.revenueHistory}
                      margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient id="gradCliente" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor="hsl(var(--chart-1))" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false}
                             tickFormatter={(v) => `${v / 1000}k`} width={36} />
                      <Tooltip
                        content={({ active, payload, label }) => (
                          <ChartTooltip
                            active={active}
                            payload={payload?.map((p) => ({
                              name: String(p.name ?? ''),
                              value: Number(p.value ?? 0),
                              color: String(p.color ?? ''),
                            }))}
                            label={label}
                            formatter={(_, value) => formatCurrency(value)}
                          />
                        )}
                      />
                      <Area
                        type="monotone"
                        dataKey="value"
                        stroke="hsl(var(--chart-1))"
                        fill="url(#gradCliente)"
                        strokeWidth={1.5}
                        dot={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Produtos mais comprados ──────────────────────────────────────── */}
        <div>
          <SectionTitle icon={<ShoppingBag className="h-4 w-4" />}>
            Produtos mais comprados
          </SectionTitle>

          {data.topProducts.length === 0 ? (
            <EmptyState
              title="Sem dados de produtos"
              description="Nenhum produto registrado para este cliente."
            />
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="divide-y">
                  {data.topProducts.map((p, i) => (
                    <div key={p.product} className="flex items-center gap-4 px-6 py-3.5">
                      <span className="text-xs font-medium text-muted-foreground w-5 shrink-0">
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0 space-y-1.5">
                        <p className="text-sm font-medium truncate">{p.product}</p>
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full bg-chart-1 transition-all duration-500"
                            style={{ width: `${p.percentage}%` }}
                          />
                        </div>
                      </div>
                      <div className="text-right shrink-0 space-y-0.5">
                        <p className="text-sm font-medium">{formatCurrency(p.totalValue)}</p>
                        <p className="text-xs text-muted-foreground">
                          {p.totalQuantity} un · {p.percentage}%
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* ── Alertas / Oportunidades ──────────────────────────────────────── */}
        {data.alerts.length > 0 && (
          <div>
            <SectionTitle icon={<AlertTriangle className="h-4 w-4" />}>
              Alertas e oportunidades
            </SectionTitle>
            <div className="space-y-3">
              {data.alerts.map((alert) => {
                const conf = CONFIDENCE_CONFIG[alert.confidence]
                return (
                  <div
                    key={alert.id}
                    className="flex items-start justify-between gap-4 rounded-xl border border-border bg-background px-5 py-4"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-xs font-normal">
                          {ALERT_TYPE_LABELS[alert.type]}
                        </Badge>
                        <Badge className={cn('text-xs font-medium border-0', conf.className)}>
                          {conf.label}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {alert.description}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(alert.expectedValue)}
                      </p>
                      <p className="text-xs text-muted-foreground">potencial</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
