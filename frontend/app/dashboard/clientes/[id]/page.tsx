// app/dashboard/clientes/[id]/page.tsx
'use client'

import { use, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, TrendingUp, TrendingDown, Minus,
  AlertTriangle, ShoppingBag, ChevronRight, Sparkles,
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
import { opportunitiesApi } from '@/lib/api/client'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'

// ─── Constantes ───────────────────────────────────────────────────────────────

const ALERT_TYPE_LABELS: Record<CustomerAlert['type'], string> = {
  missing_sale:       'Venda perdida',
  declining_customer: 'Cliente em queda',
  seasonal_gap:       'Gap sazonal',
  product_gap:        'Gap de produto',
}

const CONFIDENCE_CONFIG = {
  high:   { className: 'bg-success/10 text-success',     label: 'Alta' },
  medium: { className: 'bg-warning/10 text-warning',     label: 'Média' },
  low:    { className: 'bg-muted text-muted-foreground', label: 'Baixa' },
} as const

const RFV_SEGMENT_CONFIG: Record<CustomerRFV['segment'], { label: string; className: string; description: string }> = {
  champion: {
    label: 'Campeão',
    className: 'bg-success/10 text-success',
    description: 'Compra com frequência, alto valor, recente.',
  },
  loyal: {
    label: 'Fiel',
    className: 'bg-primary/10 text-primary',
    description: 'Alta frequência e valor consistente.',
  },
  at_risk: {
    label: 'Em risco',
    className: 'bg-warning/10 text-warning',
    description: 'Comprou bem, mas está sumindo.',
  },
  lost: {
    label: 'Perdido',
    className: 'bg-destructive/10 text-destructive',
    description: 'Sem compras há muito tempo.',
  },
  new: {
    label: 'Novo',
    className: 'bg-chart-5/10 text-chart-5',
    description: 'Primeira ou segunda compra recente.',
  },
}

const RFV_SCORE_COLORS = ['var(--destructive)', 'var(--warning)', 'var(--warning)', 'var(--success)', 'var(--success)']

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function SectionTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-primary">{icon}</span>
      <h2 className="font-[family-name:var(--font-display)] text-base font-bold tracking-[-0.02em] text-foreground">{children}</h2>
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
          style={{ backgroundColor: i < score ? RFV_SCORE_COLORS[score - 1] : 'var(--border)' }}
        />
      ))}
    </div>
  )
}

function RfvBlock({ rfv }: { rfv: CustomerRFV }) {
  const segment = RFV_SEGMENT_CONFIG[rfv.segment]

  return (
    <Card className="rounded-2xl shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="font-[family-name:var(--font-display)] text-base font-bold tracking-[-0.02em]">Métricas RFV</CardTitle>
            <CardDescription className="text-xs mt-0.5">Recência · Frequência · Valor</CardDescription>
          </div>
          <Badge className={cn('text-xs font-medium border-0 rounded-full', segment.className)}>
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
    <div className="space-y-8 p-6 lg:p-8 max-w-[1200px] mx-auto w-full">
      <div className="flex items-center gap-3">
        <Skeleton className="h-8 w-8 rounded-lg bg-muted" />
        <Skeleton className="h-6 w-48 bg-muted" />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="rounded-2xl shadow-sm">
            <CardHeader className="pb-2"><Skeleton className="h-3 w-24 bg-muted" /></CardHeader>
            <CardContent><Skeleton className="h-7 w-32 bg-muted" /></CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Skeleton className="h-64 rounded-2xl bg-muted" />
        <Skeleton className="h-64 rounded-2xl bg-muted lg:col-span-2" />
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
  const { company, user } = useAuth()
  const canUseAI = user?.role === 'admin' || user?.role === 'analyst'
  const router      = useRouter()

  const { data, isLoading, error, refetch } = useCustomerDetail(company?.id, id)
  const [msg, setMsg] = useState<{ open: boolean; text: string; loading: boolean }>({ open: false, text: '', loading: false })

  async function generateMessage() {
    setMsg({ open: true, text: '', loading: true })
    try {
      const res = await opportunitiesApi.generateMessage(id, id, '1m')
      setMsg({ open: true, loading: false, text: res.success && res.data ? res.data.message : 'Erro ao gerar mensagem. Tente novamente.' })
    } catch {
      setMsg({ open: true, loading: false, text: 'Erro ao gerar mensagem. Tente novamente.' })
    }
  }

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
    data.trend === 'up'   ? <TrendingUp   className="h-4 w-4 text-success" /> :
    data.trend === 'down' ? <TrendingDown className="h-4 w-4 text-destructive" /> :
                            <Minus        className="h-4 w-4 text-muted-foreground" />

  const recoverable = data.alerts.reduce((s, a) => s + a.expectedValue, 0)
  const topAlert = [...data.alerts].sort((a, b) => b.expectedValue - a.expectedValue)[0]

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
            <Badge className={cn('text-xs border-0 rounded-full', RFV_SEGMENT_CONFIG[data.rfv.segment].className)}>
              {RFV_SEGMENT_CONFIG[data.rfv.segment].label}
            </Badge>
          </div>
        </div>
      </div>

      {/* ── Conteúdo ────────────────────────────────────────────────────────── */}
      <div className="flex-1 p-6 lg:p-8 max-w-[1200px] mx-auto w-full space-y-8">

        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-extrabold tracking-[-0.02em]">{data.name}</h1>
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-0.5">
            {data.document && (
              <p className="text-sm text-muted-foreground">CNPJ/CPF: {data.document}</p>
            )}
            {data.branch && (
              <p className="text-sm text-muted-foreground">Filial: {data.branch}</p>
            )}
            {data.salesperson && (
              <p className="text-sm text-muted-foreground">Vendedor: {data.salesperson}</p>
            )}
          </div>
        </div>

        {/* Ação recomendada — hoisted ao topo */}
        {topAlert && (
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-primary/20 bg-accent/40 p-5 shadow-sm">
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Ação recomendada</p>
              <p className="mt-1 font-[family-name:var(--font-display)] text-3xl font-extrabold leading-none tracking-[-0.02em] text-primary tabular-nums">{formatCurrency(recoverable)}</p>
              <p className="mt-1.5 text-sm text-muted-foreground">{topAlert.description}</p>
            </div>
            {canUseAI && (
              <Button onClick={generateMessage} className="gap-2 shrink-0">
                <Sparkles className="h-4 w-4" /> Gerar mensagem
              </Button>
            )}
          </div>
        )}

        {/* ── KPIs ──────────────────────────────────────────────────────────── */}
        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="rounded-2xl shadow-sm">
            <CardHeader className="pb-2 space-y-0">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Receita total
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="font-[family-name:var(--font-display)] text-3xl font-extrabold tracking-[-0.02em] tabular-nums">{formatCurrency(data.totalRevenue)}</p>
              <p className="text-xs text-muted-foreground mt-1">{data.percentage}% da receita da empresa</p>
            </CardContent>
          </Card>

          <Card className="rounded-2xl shadow-sm">
            <CardHeader className="pb-2 space-y-0">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Última compra
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="font-[family-name:var(--font-display)] text-3xl font-extrabold tracking-[-0.02em] tabular-nums">{data.rfv.recency}d atrás</p>
              <p className="text-xs text-muted-foreground mt-1">
                {data.rfv.recency <= 30  ? 'Ativo recentemente' :
                 data.rfv.recency <= 90  ? 'Atenção recomendada' :
                                           'Risco de perda'}
              </p>
            </CardContent>
          </Card>

          <Card className="rounded-2xl shadow-sm">
            <CardHeader className="pb-2 space-y-0">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Frequência
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="font-[family-name:var(--font-display)] text-3xl font-extrabold tracking-[-0.02em] tabular-nums">{data.rfv.frequency} compras</p>
              <p className="text-xs text-muted-foreground mt-1">no período analisado</p>
            </CardContent>
          </Card>
        </div>

        {/* ── RFV + Gráfico de receita ─────────────────────────────────────── */}
        <div className="grid gap-6 lg:grid-cols-3">
          <RfvBlock rfv={data.rfv} />

          <Card className="rounded-2xl shadow-sm lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="font-[family-name:var(--font-display)] text-base font-bold tracking-[-0.02em]">Evolução de receita</CardTitle>
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
                          <stop offset="5%"  stopColor="var(--chart-1)" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0} />
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
                        stroke="var(--chart-1)"
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
            <Card className="rounded-2xl shadow-sm">
              <CardContent className="p-0">
                <div className="divide-y divide-border">
                  {data.topProducts.map((p, i) => (
                    <div key={p.product} className="flex items-center gap-4 px-6 py-3.5 transition-colors hover:bg-accent/40">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-primary tabular-nums">
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0 space-y-1.5">
                        <p className="text-sm font-medium truncate">{p.product}</p>
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full bg-primary transition-all duration-500"
                            style={{ width: `${p.percentage}%` }}
                          />
                        </div>
                      </div>
                      <div className="text-right shrink-0 space-y-0.5">
                        <p className="text-sm font-medium tabular-nums">{formatCurrency(p.totalValue)}</p>
                        <p className="text-xs text-muted-foreground tabular-nums">
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
                    className="flex items-start justify-between gap-4 rounded-2xl border border-border bg-card px-5 py-4 shadow-sm transition-all hover:shadow-md"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-xs font-normal rounded-full">
                          {ALERT_TYPE_LABELS[alert.type]}
                        </Badge>
                        <Badge className={cn('text-xs font-medium border-0 rounded-full', conf.className)}>
                          {conf.label}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {alert.description}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-base font-semibold text-primary tabular-nums">
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

      <Dialog open={msg.open} onOpenChange={(o) => setMsg((m) => ({ ...m, open: o }))}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Mensagem para WhatsApp</DialogTitle>
            <DialogDescription>Edite se necessário antes de copiar.</DialogDescription>
          </DialogHeader>
          {msg.loading ? (
            <div className="space-y-2 py-4"><Skeleton className="h-4 w-full bg-muted" /><Skeleton className="h-4 w-5/6 bg-muted" /><Skeleton className="h-4 w-4/6 bg-muted" /></div>
          ) : (
            <Textarea className="min-h-[160px] resize-none text-sm" value={msg.text} onChange={(e) => setMsg((m) => ({ ...m, text: e.target.value }))} />
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setMsg((m) => ({ ...m, open: false }))}>Fechar</Button>
            <Button disabled={msg.loading || !msg.text} onClick={() => navigator.clipboard.writeText(msg.text).then(() => toast.success('Mensagem copiada.')).catch(() => toast.error('Não foi possível copiar.'))}>Copiar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
