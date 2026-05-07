// app/dashboard/insights/page.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  DollarSign, Users, Package, AlertTriangle,
  Download, Filter, TrendingUp, TrendingDown,
  Minus, ChevronRight, X,
} from 'lucide-react'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts'

import { DashboardHeader }   from '@/components/dashboard/header'
import { useAuth }           from '@/lib/auth/auth-context'
import { useInsights }       from '@/hooks/use-insights'
import { formatCurrency }    from '@/lib/format'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button }            from '@/components/ui/button'
import { Badge }             from '@/components/ui/badge'
import { Skeleton }          from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter,
} from '@/components/ui/sheet'

import { KpiCard, KpiCardSkeleton } from '@/components/insights/kpi-card'
import { EmptyState }        from '@/components/insights/empty-state'
import { ErrorState }        from '@/components/insights/error-state'
import { ChartTooltip }      from '@/components/insights/chart-tooltip'

import type { Opportunity, CustomerRow } from '@/types/insights'
import { cn }                from '@/lib/utils'

// ─── Constantes ─────────────────────────────────────────────────────────────

const CHART_COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
  'hsl(var(--muted-foreground))',
]

const OPPORTUNITY_TYPE_LABELS: Record<Opportunity['type'], string> = {
  missing_sale:       'Venda perdida',
  declining_customer: 'Cliente em queda',
  seasonal_gap:       'Gap sazonal',
  product_gap:        'Gap de produto',
}

const CONFIDENCE_CONFIG: Record<Opportunity['confidence'], { className: string; label: string }> = {
  high:   { className: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300', label: 'Alta' },
  medium: { className: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',         label: 'Média' },
  low:    { className: 'bg-muted text-muted-foreground',                                            label: 'Baixa' },
}

const DATE_RANGE_OPTIONS = [
  { value: '1m',  label: 'Último mês' },
  { value: '3m',  label: 'Últimos 3 meses' },
  { value: '6m',  label: 'Últimos 6 meses' },
  { value: '12m', label: 'Último ano' },
]

// ─── Sub-componentes ─────────────────────────────────────────────────────────

function ConfidenceBadge({ confidence }: { confidence: Opportunity['confidence'] }) {
  const { className, label } = CONFIDENCE_CONFIG[confidence]
  return (
    <Badge className={cn('text-xs font-medium border-0', className)}>
      {label}
    </Badge>
  )
}

function TrendCell({ trend }: { trend: CustomerRow['trend'] }) {
  if (trend === 'up')
    return (
      <span className="flex items-center justify-end gap-1 text-xs text-emerald-600 dark:text-emerald-400">
        <TrendingUp className="h-3.5 w-3.5" /> Crescendo
      </span>
    )
  if (trend === 'down')
    return (
      <span className="flex items-center justify-end gap-1 text-xs text-destructive">
        <TrendingDown className="h-3.5 w-3.5" /> Em queda
      </span>
    )
  return (
    <span className="flex items-center justify-end gap-1 text-xs text-muted-foreground">
      <Minus className="h-3.5 w-3.5" /> Estável
    </span>
  )
}

function ChartSkeleton({ height = 350 }: { height?: number }) {
  return (
    <div className="flex items-end gap-2 px-2" style={{ height }}>
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton
          key={i}
          className="flex-1 rounded-sm"
          style={{ height: `${30 + Math.sin(i) * 40 + 40}%` }}
        />
      ))}
    </div>
  )
}

// ─── Página ──────────────────────────────────────────────────────────────────

export default function InsightsPage() {
  const { company } = useAuth()
  const router      = useRouter()

  const [dateRange, setDateRange]     = useState('6m')
  const [filterType, setFilterType]   = useState<'all' | Opportunity['type']>('all')
  const [filterOpen, setFilterOpen]   = useState(false)
  const [minValue, setMinValue]       = useState('')
  const [filterConfidence, setFilterConfidence] = useState<'all' | 'high' | 'medium' | 'low'>('all')

  const { data, isLoading, error, refetch } = useInsights(company?.id, dateRange)

  const summary               = data?.summary
  const opportunities         = data?.opportunities             ?? []
  const timeSeries            = data?.charts.timeSeries         ?? []
  const customerDistribution  = data?.charts.customerDistribution ?? []
  const productGaps           = data?.charts.productGaps        ?? []
  const seasonalityData       = data?.charts.seasonality        ?? []

  const minValueNum = minValue ? parseFloat(minValue) : 0
  const hasAdvancedFilter = filterConfidence !== 'all' || minValueNum > 0

  const filteredOpportunities = opportunities.filter((o) => {
    if (filterType !== 'all' && o.type !== filterType) return false
    if (filterConfidence !== 'all' && o.confidence !== filterConfidence) return false
    if (minValueNum > 0 && o.expectedValue < minValueNum) return false
    return true
  })

  function handleExportPDF() {
    window.print()
  }

  function clearAdvancedFilters() {
    setMinValue('')
    setFilterConfidence('all')
    setFilterOpen(false)
  }

  // ── Erro global ───────────────────────────────────────────────────────────
  if (error && !data) {
    return (
      <div className="flex flex-col min-h-screen">
        <DashboardHeader
          title="Insights"
          description="Análise detalhada das oportunidades de vendas."
        />
        <div className="flex-1 flex items-center justify-center">
          <ErrorState message={error} onRetry={refetch} />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-screen">
      <DashboardHeader
        title="Insights Analíticos"
        description="Análise detalhada do seu histórico e oportunidades de vendas."
      />

      <div className="flex-1 space-y-6 p-6 md:p-8 max-w-[1600px] mx-auto w-full">

        {/* ── Toolbar ──────────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger className="w-[180px] h-9 text-sm bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DATE_RANGE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant={hasAdvancedFilter ? 'default' : 'outline'}
              size="sm"
              className="h-9 gap-2"
              onClick={() => setFilterOpen(true)}
            >
              <Filter className="h-4 w-4" />
              Filtros avançados
              {hasAdvancedFilter && (
                <span className="ml-1 rounded-full bg-primary-foreground text-primary text-[10px] font-bold px-1.5">
                  {(filterConfidence !== 'all' ? 1 : 0) + (minValueNum > 0 ? 1 : 0)}
                </span>
              )}
            </Button>
          </div>
          <Button variant="outline" size="sm" className="h-9 gap-2 print:hidden" onClick={handleExportPDF}>
            <Download className="h-4 w-4" />
            Exportar PDF
          </Button>
        </div>

        {/* ── KPIs ─────────────────────────────────────────────────────────── */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => <KpiCardSkeleton key={i} />)
          ) : (
            <>
              <KpiCard
                label="Receita total"
                value={formatCurrency(summary?.totalRevenue)}
                icon={<DollarSign className="h-4 w-4" />}
                delta={summary?.revenueGrowth !== undefined ? {
                  value: `${summary.revenueGrowth > 0 ? '+' : ''}${summary.revenueGrowth}%`,
                  direction: summary.revenueGrowth >= 0 ? 'up' : 'down',
                  label: 'vs. período anterior',
                } : undefined}
              />
              <KpiCard
                label="Receita perdida"
                value={formatCurrency(summary?.lostRevenue)}
                icon={<AlertTriangle className="h-4 w-4" />}
                variant="danger"
                delta={summary?.lostRate !== undefined ? {
                  value: `${summary.lostRate}%`,
                  direction: 'down',
                  label: 'da receita potencial',
                } : undefined}
              />
              <KpiCard
                label="Clientes ativos"
                value={String(summary?.uniqueCustomers ?? '—')}
                icon={<Users className="h-4 w-4" />}
              />
              <KpiCard
                label="Produtos analisados"
                value={String(summary?.uniqueProducts ?? '—')}
                icon={<Package className="h-4 w-4" />}
                delta={{
                  value: String(opportunities.length),
                  direction: 'neutral',
                  label: 'com oportunidades',
                }}
              />
            </>
          )}
        </div>

        {/* ── Tabs ─────────────────────────────────────────────────────────── */}
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="h-10 bg-muted/50 p-1">
            <TabsTrigger value="overview"      className="text-sm px-4">Visão geral</TabsTrigger>
            <TabsTrigger value="opportunities" className="text-sm px-4">
              Oportunidades
              {opportunities.length > 0 && (
                <Badge className="ml-2 h-4 px-1.5 text-[10px] font-semibold bg-primary/10 text-primary border-0">
                  {opportunities.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="customers"   className="text-sm px-4">Clientes</TabsTrigger>
            <TabsTrigger value="seasonality" className="text-sm px-4">Sazonalidade</TabsTrigger>
          </TabsList>

          {/* ── Visão Geral ────────────────────────────────────────────────── */}
          <TabsContent value="overview" className="space-y-6 animate-in fade-in duration-500">
            <div className="grid gap-6 lg:grid-cols-2">

              <Card className="lg:col-span-2">
                <CardHeader className="pb-4">
                  <CardTitle className="text-base font-semibold">Receita vs. receita perdida</CardTitle>
                  <CardDescription>Evolução real ao longo do tempo</CardDescription>
                </CardHeader>
                <CardContent>
                  {isLoading ? <ChartSkeleton height={350} /> : (
                    <div className="h-[350px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={timeSeries} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                          <defs>
                            <linearGradient id="gradReceita" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%"  stopColor="hsl(var(--chart-1))" stopOpacity={0.25} />
                              <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="gradPerdida" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%"  stopColor="hsl(var(--destructive))" stopOpacity={0.2} />
                              <stop offset="95%" stopColor="hsl(var(--destructive))" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                          <XAxis
                            dataKey="month"
                            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                            tickLine={false} axisLine={false} dy={10}
                          />
                          <YAxis
                            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                            tickLine={false} axisLine={false}
                            tickFormatter={(v) => `${v / 1000}k`} dx={-10}
                          />
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
                                formatter={(name, value) =>
                                  `${name === 'receita' ? 'Receita' : 'Perdida'}: ${formatCurrency(value)}`
                                }
                              />
                            )}
                          />
                          <Area
                            type="monotone" dataKey="receita"
                            stroke="hsl(var(--chart-1))" fill="url(#gradReceita)"
                            strokeWidth={2} dot={false}
                            activeDot={{ r: 5, strokeWidth: 0 }}
                          />
                          <Area
                            type="monotone" dataKey="perdida"
                            stroke="hsl(var(--destructive))" fill="url(#gradPerdida)"
                            strokeWidth={2} dot={false}
                            activeDot={{ r: 5, strokeWidth: 0 }}
                          />
                          <Legend iconSize={8} iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: '10px' }} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-4">
                  <CardTitle className="text-base font-semibold">Gap de produtos</CardTitle>
                  <CardDescription>Diferença entre esperado e realizado</CardDescription>
                </CardHeader>
                <CardContent>
                  {isLoading ? <ChartSkeleton height={300} /> : productGaps.length === 0 ? (
                    <EmptyState
                      title="Sem gaps detectados"
                      description="Nenhuma diferença significativa neste período."
                    />
                  ) : (
                    <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={productGaps} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
                          <XAxis
                            type="number"
                            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                            tickLine={false} axisLine={false}
                            tickFormatter={(v) => `${v / 1000}k`}
                          />
                          <YAxis
                            type="category" dataKey="produto"
                            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                            tickLine={false} axisLine={false} width={90}
                          />
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
                                formatter={(_, value) => `Gap: ${formatCurrency(value)}`}
                              />
                            )}
                          />
                          <Bar dataKey="gap" fill="hsl(var(--destructive))" radius={[0, 4, 4, 0]} maxBarSize={24} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-4">
                  <CardTitle className="text-base font-semibold">Distribuição por cliente</CardTitle>
                  <CardDescription>Participação na receita total</CardDescription>
                </CardHeader>
                <CardContent>
                  {isLoading ? <ChartSkeleton height={300} /> : customerDistribution.length === 0 ? (
                    <EmptyState
                      title="Sem dados de clientes"
                      description="Faça upload de uma base para visualizar a distribuição."
                    />
                  ) : (
                    <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={customerDistribution}
                            cx="50%" cy="45%"
                            innerRadius={70} outerRadius={100}
                            paddingAngle={2} dataKey="value"
                          >
                            {customerDistribution.map((_, i) => (
                              <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip
                            content={({ active, payload }) => {
                              if (!active || !payload?.length) return null
                              const d = payload[0].payload as CustomerRow
                              return (
                                <div className="rounded-lg border border-border bg-background px-3 py-2.5 text-sm">
                                  <p className="font-medium text-foreground">{d.name}</p>
                                  <p className="text-muted-foreground mt-1">{formatCurrency(d.value)}</p>
                                  <p className="text-xs text-muted-foreground">{d.percentage}% do total</p>
                                </div>
                              )
                            }}
                          />
                          <Legend iconSize={8} iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ── Oportunidades ──────────────────────────────────────────────── */}
          <TabsContent value="opportunities" className="animate-in fade-in duration-500">
            <Card>
              <CardHeader className="pb-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <CardTitle className="text-base font-semibold">Oportunidades mapeadas</CardTitle>
                    <CardDescription className="mt-1">Vendas perdidas identificadas pela IA</CardDescription>
                  </div>
                  <Select
                    value={filterType}
                    onValueChange={(v) => setFilterType(v as typeof filterType)}
                  >
                    <SelectTrigger className="w-[180px] h-9 text-sm bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os tipos</SelectItem>
                      {(Object.entries(OPPORTUNITY_TYPE_LABELS) as [Opportunity['type'], string][]).map(
                        ([value, label]) => (
                          <SelectItem key={value} value={value}>{label}</SelectItem>
                        )
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="space-y-px">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className="flex items-center gap-4 px-6 py-4 border-b border-border">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-5 w-20 rounded-full" />
                        <Skeleton className="h-4 w-20 ml-auto" />
                      </div>
                    ))}
                  </div>
                ) : filteredOpportunities.length === 0 ? (
                  <EmptyState
                    title="Nenhuma oportunidade"
                    description={
                      filterType !== 'all'
                        ? 'Tente remover o filtro.'
                        : 'O motor não detectou oportunidades neste período.'
                    }
                    action={filterType !== 'all'
                      ? { label: 'Limpar filtro', onClick: () => setFilterType('all') }
                      : undefined
                    }
                  />
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent bg-muted/30">
                          <TableHead className="pl-6 h-10 text-xs uppercase tracking-wider text-muted-foreground">Cliente</TableHead>
                          <TableHead className="h-10 text-xs uppercase tracking-wider text-muted-foreground">Produto</TableHead>
                          <TableHead className="h-10 text-xs uppercase tracking-wider text-muted-foreground">Tipo</TableHead>
                          <TableHead className="h-10 text-xs uppercase tracking-wider text-muted-foreground">Última compra</TableHead>
                          <TableHead className="h-10 text-xs uppercase tracking-wider text-muted-foreground">Frequência</TableHead>
                          <TableHead className="h-10 text-xs uppercase tracking-wider text-muted-foreground text-right">Potencial</TableHead>
                          <TableHead className="pr-6 h-10 text-xs uppercase tracking-wider text-muted-foreground text-right">Confiança</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredOpportunities.map((opp) => (
                          <TableRow key={opp.id} className="transition-colors hover:bg-muted/50">
                            <TableCell className="pl-6 font-medium">{opp.customer}</TableCell>
                            <TableCell className="text-muted-foreground">{opp.product ?? 'Geral'}</TableCell>
                            <TableCell>
                              <Badge variant="secondary" className="font-normal bg-secondary/50 text-foreground">
                                {OPPORTUNITY_TYPE_LABELS[opp.type]}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {opp.lastPurchase
                                ? new Date(opp.lastPurchase).toLocaleDateString('pt-BR')
                                : '—'}
                            </TableCell>
                            <TableCell className="text-muted-foreground">{opp.frequency ?? 'Irregular'}</TableCell>
                            <TableCell className="text-right font-medium text-emerald-600 dark:text-emerald-400">
                              {formatCurrency(opp.expectedValue)}
                            </TableCell>
                            <TableCell className="pr-6 text-right">
                              <ConfidenceBadge confidence={opp.confidence} />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Clientes ───────────────────────────────────────────────────── */}
          <TabsContent value="customers" className="animate-in fade-in duration-500">
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-base font-semibold">Desempenho de clientes</CardTitle>
                <CardDescription>Clique em um cliente para ver o perfil completo</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="space-y-px">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="flex items-center gap-4 px-6 py-4 border-b border-border">
                        <Skeleton className="h-4 w-40" />
                        <Skeleton className="h-4 w-24 ml-auto" />
                        <Skeleton className="h-4 w-12" />
                        <Skeleton className="h-4 w-20" />
                      </div>
                    ))}
                  </div>
                ) : customerDistribution.length === 0 ? (
                  <EmptyState
                    title="Sem dados de clientes"
                    description="Faça upload de uma base de vendas para analisar o comportamento dos clientes."
                    action={{ label: 'Importar dados', onClick: () => router.push('/dashboard/upload') }}
                  />
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent bg-muted/30">
                          <TableHead className="pl-6 h-10 text-xs uppercase tracking-wider text-muted-foreground">Cliente</TableHead>
                          <TableHead className="h-10 text-xs uppercase tracking-wider text-muted-foreground text-right">Receita total</TableHead>
                          <TableHead className="h-10 text-xs uppercase tracking-wider text-muted-foreground text-right">Participação</TableHead>
                          <TableHead className="h-10 text-xs uppercase tracking-wider text-muted-foreground text-right">Tendência</TableHead>
                          {/* Coluna do chevron — sem label */}
                          <TableHead className="pr-6 w-8" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {customerDistribution.map((customer) => (
                          <TableRow
                            key={customer.id}
                            className="transition-colors hover:bg-muted/50 cursor-pointer group"
                            onClick={() => router.push(`/dashboard/clientes/${customer.id}`)}
                          >
                            <TableCell className="pl-6 font-medium">{customer.name}</TableCell>
                            <TableCell className="text-right font-medium">{formatCurrency(customer.value)}</TableCell>
                            <TableCell className="text-right text-muted-foreground">{customer.percentage}%</TableCell>
                            <TableCell className="text-right">
                              <TrendCell trend={customer.trend} />
                            </TableCell>
                            {/* Chevron aparece só no hover */}
                            <TableCell className="pr-6 w-8">
                              <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity ml-auto" />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Sazonalidade ───────────────────────────────────────────────── */}
          <TabsContent value="seasonality" className="animate-in fade-in duration-500">
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-base font-semibold">Análise de sazonalidade</CardTitle>
                <CardDescription>Comparação do faturamento atual contra a média histórica</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? <ChartSkeleton height={350} /> : seasonalityData.length === 0 ? (
                  <EmptyState
                    title="Sem dados de sazonalidade"
                    description="É necessário pelo menos 12 meses de histórico para analisar sazonalidade."
                  />
                ) : (
                  <div className="h-[350px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={seasonalityData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                        <XAxis
                          dataKey="month"
                          tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                          tickLine={false} axisLine={false} dy={10}
                        />
                        <YAxis
                          tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                          tickLine={false} axisLine={false}
                          tickFormatter={(v) => `${v}k`} dx={-10}
                        />
                        <Tooltip
                          content={({ active, payload, label }) => {
                            if (!active || !payload?.length) return null
                            const d = payload[0].payload as { atual: number; media: number; variacao: number }
                            return (
                              <div className="rounded-lg border border-border bg-background px-4 py-3 text-sm space-y-2">
                                <p className="font-semibold text-foreground border-b border-border pb-1">{label}</p>
                                <div className="flex justify-between gap-4">
                                  <span className="text-muted-foreground">Atual:</span>
                                  <span className="font-medium">R$ {d.atual}k</span>
                                </div>
                                <div className="flex justify-between gap-4">
                                  <span className="text-muted-foreground">Média:</span>
                                  <span className="font-medium">R$ {d.media}k</span>
                                </div>
                                <div className="flex justify-between gap-4 pt-1 border-t border-border">
                                  <span className="text-muted-foreground">Variação:</span>
                                  <span className={cn(
                                    'font-semibold',
                                    d.variacao >= 0
                                      ? 'text-emerald-600 dark:text-emerald-400'
                                      : 'text-destructive'
                                  )}>
                                    {d.variacao >= 0 ? '+' : ''}{d.variacao}%
                                  </span>
                                </div>
                              </div>
                            )
                          }}
                        />
                        <Bar dataKey="atual" fill="hsl(var(--chart-1))"          radius={[4, 4, 0, 0]} maxBarSize={32} name="Atual" />
                        <Bar dataKey="media" fill="hsl(var(--muted-foreground))" fillOpacity={0.35} radius={[4, 4, 0, 0]} maxBarSize={32} name="Média histórica" />
                        <Legend iconSize={8} iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: '10px' }} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* ── Filtros avançados ─────────────────────────────────────────────── */}
      <Sheet open={filterOpen} onOpenChange={setFilterOpen}>
        <SheetContent side="right" className="w-80">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Filter className="h-4 w-4" /> Filtros avançados
            </SheetTitle>
          </SheetHeader>

          <div className="mt-6 space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium">Valor mínimo esperado (R$)</label>
              <Input
                type="number"
                min="0"
                placeholder="ex: 500"
                value={minValue}
                onChange={(e) => setMinValue(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Mostra só oportunidades acima deste valor.</p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Confiança</label>
              <Select value={filterConfidence} onValueChange={(v) => setFilterConfidence(v as typeof filterConfidence)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="high">Alta</SelectItem>
                  <SelectItem value="medium">Média</SelectItem>
                  <SelectItem value="low">Baixa</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {hasAdvancedFilter && (
              <div className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                {filteredOpportunities.length} oportunidade{filteredOpportunities.length !== 1 ? 's' : ''} com os filtros aplicados
              </div>
            )}
          </div>

          <SheetFooter className="mt-8 flex-col gap-2">
            <Button className="w-full" onClick={() => setFilterOpen(false)}>
              Aplicar filtros
            </Button>
            {hasAdvancedFilter && (
              <Button variant="ghost" className="w-full gap-2" onClick={clearAdvancedFilters}>
                <X className="h-4 w-4" /> Limpar filtros avançados
              </Button>
            )}
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  )
}