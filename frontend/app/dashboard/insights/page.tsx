// app/dashboard/insights/page.tsx
'use client'

import { Fragment, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  DollarSign, Users, Package, AlertTriangle, Download, TrendingUp, TrendingDown,
  Minus, ChevronRight, ChevronDown, Sparkles, ArrowRight,
} from 'lucide-react'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'

import { DashboardHeader }   from '@/components/dashboard/header'
import { useAuth }           from '@/lib/auth/auth-context'
import { CohortCard }        from '@/components/insights/cohort-card'
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'

import { KpiCard, KpiCardSkeleton } from '@/components/insights/kpi-card'
import { EmptyState }        from '@/components/insights/empty-state'
import { ErrorState }        from '@/components/insights/error-state'
import { ChartTooltip }      from '@/components/insights/chart-tooltip'

import type { Opportunity, CustomerRow } from '@/types/insights'
import { cn }                from '@/lib/utils'
import { opportunitiesApi, insightsApi } from '@/lib/api/client'
import { toast }             from 'sonner'

// ─── Constantes ─────────────────────────────────────────────────────────────

const CHART_COLORS = [
  'var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)',
  'var(--chart-4)', 'var(--chart-5)', 'var(--muted-foreground)',
]

const OPPORTUNITY_TYPE_LABELS: Record<Opportunity['type'], string> = {
  missing_sale: 'Venda perdida', declining_customer: 'Cliente em queda',
  seasonal_gap: 'Gap sazonal', product_gap: 'Gap de produto',
}

const CONFIDENCE_CONFIG: Record<Opportunity['confidence'], { className: string; label: string }> = {
  high:   { className: 'bg-success/10 text-success',     label: 'Alta' },
  medium: { className: 'bg-warning/10 text-warning',     label: 'Média' },
  low:    { className: 'bg-muted text-muted-foreground', label: 'Baixa' },
}

const DATE_RANGE_OPTIONS = [
  { value: '1m', label: 'Último mês' }, { value: '3m', label: 'Últimos 3 meses' },
  { value: '6m', label: 'Últimos 6 meses' }, { value: '12m', label: 'Último ano' },
]

// ─── Sub-componentes ─────────────────────────────────────────────────────────

function ConfidenceBadge({ confidence }: { confidence: Opportunity['confidence'] }) {
  const { className, label } = CONFIDENCE_CONFIG[confidence]
  return <Badge className={cn('text-xs font-medium border-0', className)}>{label}</Badge>
}

function TrendCell({ trend }: { trend: CustomerRow['trend'] }) {
  if (trend === 'up') return <span className="flex items-center justify-end gap-1 text-xs text-success"><TrendingUp className="h-3.5 w-3.5" /> Crescendo</span>
  if (trend === 'down') return <span className="flex items-center justify-end gap-1 text-xs text-destructive"><TrendingDown className="h-3.5 w-3.5" /> Em queda</span>
  return <span className="flex items-center justify-end gap-1 text-xs text-muted-foreground"><Minus className="h-3.5 w-3.5" /> Estável</span>
}

function ChartSkeleton({ height = 320 }: { height?: number }) {
  return (
    <div className="flex items-end gap-2 px-2" style={{ height }}>
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={i} className="flex-1 rounded-md bg-muted" style={{ height: `${30 + Math.sin(i) * 40 + 40}%` }} />
      ))}
    </div>
  )
}

// ─── Página ──────────────────────────────────────────────────────────────────

export default function InsightsPage() {
  const { company, user } = useAuth()
  const canUseAI = user?.role === 'admin' || user?.role === 'analyst'
  const router = useRouter()

  const [dateRange, setDateRange] = useState('6m')
  const [tab, setTab] = useState('oportunidades')
  const [filterType, setFilterType] = useState<'all' | Opportunity['type']>('all')
  const [filterConfidence, setFilterConfidence] = useState<'all' | 'high' | 'medium' | 'low'>('all')
  const [minValue, setMinValue] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [exportingPdf, setExportingPdf] = useState(false)
  const [msgModal, setMsgModal] = useState<{ open: boolean; text: string; loading: boolean }>({
    open: false, text: '', loading: false,
  })

  const { data, isLoading, error, refetch } = useInsights(company?.id, dateRange)

  const summary = data?.summary
  const opportunities = data?.opportunities ?? []
  const timeSeries = data?.charts.timeSeries ?? []
  const customerDistribution = data?.charts.customerDistribution ?? []
  const productGaps = data?.charts.productGaps ?? []
  const seasonalityData = data?.charts.seasonality ?? []

  const minValueNum = minValue ? parseFloat(minValue) : 0
  const filteredOpportunities = opportunities.filter((o) => {
    if (filterType !== 'all' && o.type !== filterType) return false
    if (filterConfidence !== 'all' && o.confidence !== filterConfidence) return false
    if (minValueNum > 0 && o.expectedValue < minValueNum) return false
    return true
  })

  // Camada 1 — achados em palavras (derivados dos dados)
  type Finding = { tone: string; serif?: boolean; value: string; text: string; cta: string; to: string }
  const findings: Finding[] = []
  if (summary?.lostRevenue) {
    findings.push({ tone: 'text-destructive', serif: true, value: formatCurrency(summary.lostRevenue), text: `em receita perdida, mapeada em ${opportunities.length} oportunidades.`, cta: 'Ver oportunidades', to: 'oportunidades' })
  }
  if (productGaps[0]) {
    findings.push({ tone: 'text-warning', value: formatCurrency(productGaps[0].gap), text: `de gap em ${productGaps[0].produto} — produto perdendo giro.`, cta: 'Ver análise', to: 'analise' })
  }
  if (seasonalityData.length) {
    const worst = [...seasonalityData].sort((a, b) => a.variacao - b.variacao)[0]
    findings.push({ tone: 'text-primary', value: `${worst.variacao > 0 ? '+' : ''}${worst.variacao}%`, text: `${worst.month} costuma destoar da média — ajuste a abordagem.`, cta: 'Ver sazonalidade', to: 'analise' })
  }

  async function handleGenerateMessage(opp: Opportunity & { customerHash?: string }) {
    const customerHash = opp.customerHash ?? opp.id
    setMsgModal({ open: true, text: '', loading: true })
    try {
      const res = await opportunitiesApi.generateMessage(opp.id, customerHash, dateRange)
      setMsgModal({ open: true, loading: false, text: res.success && res.data ? res.data.message : 'Erro ao gerar mensagem. Tente novamente.' })
    } catch {
      setMsgModal({ open: true, loading: false, text: 'Erro ao gerar mensagem. Tente novamente.' })
    }
  }

  async function handleExportPDF() {
    if (!data || !company?.id) return
    setExportingPdf(true)
    try {
      const blob = await insightsApi.downloadReport(company.id, dateRange)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `relatorio-radar-${dateRange}.pdf`
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
    } catch {
      toast.error('Não foi possível gerar o PDF. Tente novamente.')
    } finally { setExportingPdf(false) }
  }

  if (error && !data) {
    return (
      <div className="flex flex-col min-h-screen">
        <DashboardHeader title="Insights" description="Análise detalhada das oportunidades de vendas." />
        <div className="flex-1 flex items-center justify-center"><ErrorState message={error} onRetry={refetch} /></div>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-screen">
      <DashboardHeader title="Insights" description="Do panorama ao detalhe — comece pelos achados." />

      <div className="flex-1 space-y-6 p-6 lg:p-8 max-w-[1600px] mx-auto w-full">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-[180px] h-9 text-sm bg-card"><SelectValue /></SelectTrigger>
            <SelectContent>{DATE_RANGE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="h-9 gap-2" onClick={handleExportPDF} disabled={!data || isLoading || exportingPdf}>
            <Download className="h-4 w-4" /> {exportingPdf ? 'Gerando...' : 'Exportar PDF'}
          </Button>
        </div>

        {/* Banner de defasagem */}
        {summary?.dataFreshness && summary.dataFreshness !== 'live' && (
          <div className="flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/[0.08] px-4 py-3 text-sm text-foreground">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-warning" />
            <div><span className="font-medium">Dados {summary.dataFreshness}.</span> Oportunidades calculadas na data mais recente do arquivo — faça um upload novo para refletir hoje.</div>
          </div>
        )}

        {/* CAMADA 1 — Achados */}
        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-28 rounded-2xl bg-muted" />)}</div>
        ) : findings.length > 0 && (
          <div>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">O que encontramos</h2>
            <div className="grid gap-4 sm:grid-cols-3">
              {findings.map((f, i) => (
                <Card key={i} className="flex flex-col justify-between rounded-2xl shadow-sm transition-all hover:shadow-md">
                  <CardContent className="pt-6">
                    <p className={cn('font-[family-name:var(--font-display)] tracking-[-0.02em] tabular-nums', f.tone, f.serif ? 'text-3xl font-extrabold leading-none' : 'text-2xl font-bold')}>{f.value}</p>
                    <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{f.text}</p>
                  </CardContent>
                  <div className="px-6 pb-4">
                    <Button variant="ghost" size="sm" className="h-7 gap-1 px-0 text-primary hover:bg-transparent hover:text-primary/80" onClick={() => setTab(f.to)}>
                      {f.cta} <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* KPIs de apoio (mono) */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {isLoading ? Array.from({ length: 4 }).map((_, i) => <KpiCardSkeleton key={i} />) : (
            <>
              <KpiCard label="Receita total" value={formatCurrency(summary?.totalRevenue)} icon={<DollarSign className="h-4 w-4" />} />
              <KpiCard label="Receita perdida" value={formatCurrency(summary?.lostRevenue)} icon={<AlertTriangle className="h-4 w-4" />} variant="danger" delta={summary?.lostRate !== undefined ? { value: `${summary.lostRate}%`, direction: 'down', label: 'do potencial' } : undefined} />
              <KpiCard label="Clientes ativos" value={String(summary?.uniqueCustomers ?? '—')} icon={<Users className="h-4 w-4" />} />
              <KpiCard label="Produtos analisados" value={String(summary?.uniqueProducts ?? '—')} icon={<Package className="h-4 w-4" />} />
            </>
          )}
        </div>

        {/* CAMADA 2/3 — duas visões: drill na tabela OU análise gráfica */}
        <Tabs value={tab} onValueChange={setTab} className="space-y-5">
          <TabsList className="h-10 bg-secondary p-1">
            <TabsTrigger value="oportunidades" className="text-sm px-4">
              Oportunidades
              {opportunities.length > 0 && <Badge className="ml-2 h-4 px-1.5 text-[10px] font-semibold bg-primary/10 text-primary border-0 rounded-full tabular-nums">{opportunities.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="analise" className="text-sm px-4">Análise</TabsTrigger>
          </TabsList>

          {/* ── Oportunidades: filtros visíveis + tabela enxuta com expand ── */}
          <TabsContent value="oportunidades" className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Select value={filterType} onValueChange={(v) => setFilterType(v as typeof filterType)}>
                <SelectTrigger className="h-9 w-[170px] text-sm bg-card"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os tipos</SelectItem>
                  {(Object.entries(OPPORTUNITY_TYPE_LABELS) as [Opportunity['type'], string][]).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterConfidence} onValueChange={(v) => setFilterConfidence(v as typeof filterConfidence)}>
                <SelectTrigger className="h-9 w-[150px] text-sm bg-card"><SelectValue placeholder="Confiança" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toda confiança</SelectItem>
                  <SelectItem value="high">Alta</SelectItem>
                  <SelectItem value="medium">Média</SelectItem>
                  <SelectItem value="low">Baixa</SelectItem>
                </SelectContent>
              </Select>
              <Input type="number" min="0" placeholder="Valor mínimo R$" value={minValue} onChange={(e) => setMinValue(e.target.value)} className="h-9 w-[150px] text-sm bg-card" />
              <span className="ml-auto text-sm text-muted-foreground tabular-nums">{filteredOpportunities.length} de {opportunities.length}</span>
            </div>

            <Card className="rounded-2xl shadow-sm">
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="space-y-px p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full bg-muted" />)}</div>
                ) : filteredOpportunities.length === 0 ? (
                  <EmptyState title="Nenhuma oportunidade" description="Ajuste os filtros ou faça um novo upload." />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent bg-muted/30">
                        <TableHead className="pl-6 h-10 text-xs uppercase tracking-wider text-muted-foreground">Cliente</TableHead>
                        <TableHead className="h-10 text-xs uppercase tracking-wider text-muted-foreground text-right">Potencial</TableHead>
                        <TableHead className="h-10 text-xs uppercase tracking-wider text-muted-foreground text-right pr-2">Confiança</TableHead>
                        <TableHead className="h-10 w-10 pr-6" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredOpportunities.map((opp) => (
                        <Fragment key={opp.id}>
                          <TableRow className="cursor-pointer transition-colors hover:bg-accent/50" onClick={() => setExpanded(expanded === opp.id ? null : opp.id)}>
                            <TableCell className="pl-6 font-medium">{opp.customer}</TableCell>
                            <TableCell className="text-right font-semibold tabular-nums text-primary">{formatCurrency(opp.expectedValue)}</TableCell>
                            <TableCell className="text-right pr-2"><ConfidenceBadge confidence={opp.confidence} /></TableCell>
                            <TableCell className="w-10 pr-6"><ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform ml-auto', expanded === opp.id && 'rotate-180')} /></TableCell>
                          </TableRow>
                          {expanded === opp.id && (
                            <TableRow className="bg-muted/20 hover:bg-muted/20">
                              <TableCell colSpan={4} className="px-6 py-4">
                                <div className="grid gap-3 sm:grid-cols-4 text-sm">
                                  <div><p className="text-xs text-muted-foreground">Produto</p><p className="font-medium">{opp.product ?? 'Geral'}</p></div>
                                  <div><p className="text-xs text-muted-foreground">Tipo</p><p className="font-medium">{OPPORTUNITY_TYPE_LABELS[opp.type]}</p></div>
                                  <div><p className="text-xs text-muted-foreground">Última compra</p><p className="font-medium tabular-nums">{opp.lastPurchase ? new Date(opp.lastPurchase).toLocaleDateString('pt-BR') : '—'}</p></div>
                                  <div><p className="text-xs text-muted-foreground">Frequência</p><p className="font-medium">{opp.frequency ?? 'Irregular'}</p></div>
                                </div>
                                {opp.description && <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{opp.description}</p>}
                                {canUseAI && (
                                  <Button size="sm" variant="outline" className="mt-4 gap-1.5" onClick={(e) => { e.stopPropagation(); handleGenerateMessage(opp) }}>
                                    <Sparkles className="h-3.5 w-3.5" /> Gerar mensagem
                                  </Button>
                                )}
                              </TableCell>
                            </TableRow>
                          )}
                        </Fragment>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Análise: gráficos de apoio + clientes + sazonalidade ── */}
          <TabsContent value="analise" className="space-y-6">
            <Card className="rounded-2xl shadow-sm">
              <CardHeader className="pb-4"><CardTitle className="font-[family-name:var(--font-display)] text-lg font-bold tracking-[-0.02em]">Receita vs. receita perdida</CardTitle><CardDescription>Evolução ao longo do tempo</CardDescription></CardHeader>
              <CardContent>
                {isLoading ? <ChartSkeleton height={300} /> : (
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={timeSeries} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="gRec" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.25} /><stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0} /></linearGradient>
                          <linearGradient id="gPer" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="var(--destructive)" stopOpacity={0.2} /><stop offset="95%" stopColor="var(--destructive)" stopOpacity={0} /></linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                        <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} dy={10} />
                        <YAxis tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v / 1000}k`} dx={-10} />
                        <Tooltip content={({ active, payload, label }) => <ChartTooltip active={active} payload={payload?.map((p) => ({ name: String(p.name ?? ''), value: Number(p.value ?? 0), color: String(p.color ?? '') }))} label={label} formatter={(name, value) => `${name === 'receita' ? 'Receita' : 'Perdida'}: ${formatCurrency(value)}`} />} />
                        <Area type="monotone" dataKey="receita" stroke="var(--chart-1)" fill="url(#gRec)" strokeWidth={2} dot={false} />
                        <Area type="monotone" dataKey="perdida" stroke="var(--destructive)" fill="url(#gPer)" strokeWidth={2} dot={false} />
                        <Legend iconSize={8} iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: 10 }} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="rounded-2xl shadow-sm">
                <CardHeader className="pb-4"><CardTitle className="font-[family-name:var(--font-display)] text-lg font-bold tracking-[-0.02em]">Gap de produtos</CardTitle><CardDescription>Esperado versus realizado</CardDescription></CardHeader>
                <CardContent>
                  {isLoading ? <ChartSkeleton height={280} /> : productGaps.length === 0 ? <EmptyState title="Sem gaps" description="Nada significativo no período." /> : (
                    <div className="h-[280px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={productGaps} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
                          <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v / 1000}k`} />
                          <YAxis type="category" dataKey="produto" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} width={90} />
                          <Tooltip content={({ active, payload, label }) => <ChartTooltip active={active} payload={payload?.map((p) => ({ name: String(p.name ?? ''), value: Number(p.value ?? 0), color: String(p.color ?? '') }))} label={label} formatter={(_, value) => `Gap: ${formatCurrency(value)}`} />} />
                          <Bar dataKey="gap" fill="var(--destructive)" radius={[0, 4, 4, 0]} maxBarSize={24} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="rounded-2xl shadow-sm">
                <CardHeader className="pb-4"><CardTitle className="font-[family-name:var(--font-display)] text-lg font-bold tracking-[-0.02em]">Distribuição por cliente</CardTitle><CardDescription>Participação na receita</CardDescription></CardHeader>
                <CardContent>
                  {isLoading ? <ChartSkeleton height={280} /> : customerDistribution.length === 0 ? <EmptyState title="Sem dados" description="Faça upload de uma base." /> : (
                    <div className="h-[280px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={customerDistribution} cx="50%" cy="45%" innerRadius={66} outerRadius={96} paddingAngle={2} dataKey="value">
                            {customerDistribution.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                          </Pie>
                          <Tooltip content={({ active, payload }) => { if (!active || !payload?.length) return null; const d = payload[0].payload as CustomerRow; return <div className="rounded-lg border border-border bg-background px-3 py-2.5 text-sm"><p className="font-medium text-foreground">{d.name}</p><p className="text-muted-foreground mt-1 tabular-nums">{formatCurrency(d.value)}</p><p className="text-xs text-muted-foreground tabular-nums">{d.percentage}% do total</p></div> }} />
                          <Legend iconSize={8} iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Clientes — lista enxuta */}
            <Card className="rounded-2xl shadow-sm">
              <CardHeader className="pb-4"><CardTitle className="font-[family-name:var(--font-display)] text-lg font-bold tracking-[-0.02em]">Desempenho de clientes</CardTitle><CardDescription>Clique para ver o perfil completo</CardDescription></CardHeader>
              <CardContent className="p-0">
                {isLoading ? <div className="space-y-px p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full bg-muted" />)}</div> : customerDistribution.length === 0 ? (
                  <EmptyState title="Sem dados de clientes" description="Faça upload de uma base." action={{ label: 'Importar dados', onClick: () => router.push('/dashboard/upload') }} />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent bg-muted/30">
                        <TableHead className="pl-6 h-10 text-xs uppercase tracking-wider text-muted-foreground">Cliente</TableHead>
                        <TableHead className="h-10 text-xs uppercase tracking-wider text-muted-foreground text-right">Receita</TableHead>
                        <TableHead className="h-10 text-xs uppercase tracking-wider text-muted-foreground text-right">Participação</TableHead>
                        <TableHead className="h-10 text-xs uppercase tracking-wider text-muted-foreground text-right">Tendência</TableHead>
                        <TableHead className="pr-6 w-8" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {customerDistribution.map((c) => (
                        <TableRow key={c.id} className="cursor-pointer transition-colors hover:bg-accent/50 group" onClick={() => router.push(`/dashboard/clientes/${c.id}`)}>
                          <TableCell className="pl-6 font-medium">{c.name}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatCurrency(c.value)}</TableCell>
                          <TableCell className="text-right text-muted-foreground tabular-nums">{c.percentage}%</TableCell>
                          <TableCell className="text-right"><TrendCell trend={c.trend} /></TableCell>
                          <TableCell className="pr-6 w-8"><ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity ml-auto" /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {/* Sazonalidade */}
            <Card className="rounded-2xl shadow-sm">
              <CardHeader className="pb-4"><CardTitle className="font-[family-name:var(--font-display)] text-lg font-bold tracking-[-0.02em]">Sazonalidade</CardTitle><CardDescription>Atual versus média histórica</CardDescription></CardHeader>
              <CardContent>
                {isLoading ? <ChartSkeleton height={300} /> : seasonalityData.length === 0 ? <EmptyState title="Sem sazonalidade" description="São necessários 12+ meses de histórico." /> : (
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={seasonalityData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                        <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} dy={10} />
                        <YAxis tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}k`} dx={-10} />
                        <Tooltip content={({ active, payload, label }) => { if (!active || !payload?.length) return null; const d = payload[0].payload as { atual: number; media: number; variacao: number }; return <div className="rounded-lg border border-border bg-background px-4 py-3 text-sm space-y-1"><p className="font-semibold border-b border-border pb-1">{label}</p><div className="flex justify-between gap-4"><span className="text-muted-foreground">Atual</span><span className="tabular-nums">R$ {d.atual}k</span></div><div className="flex justify-between gap-4"><span className="text-muted-foreground">Média</span><span className="tabular-nums">R$ {d.media}k</span></div><div className="flex justify-between gap-4 pt-1 border-t border-border"><span className="text-muted-foreground">Variação</span><span className={cn('font-semibold tabular-nums', d.variacao >= 0 ? 'text-success' : 'text-destructive')}>{d.variacao >= 0 ? '+' : ''}{d.variacao}%</span></div></div> }} />
                        <Bar dataKey="atual" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={32} name="Atual" />
                        <Bar dataKey="media" fill="var(--muted-foreground)" fillOpacity={0.35} radius={[4, 4, 0, 0]} maxBarSize={32} name="Média histórica" />
                        <Legend iconSize={8} iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: 10 }} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Retenção por safra (cohorts) */}
        {company?.id && <CohortCard companyId={company.id} />}
      </div>

      {/* Modal IA */}
      <Dialog open={msgModal.open} onOpenChange={(open) => setMsgModal((m) => ({ ...m, open }))}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Mensagem para WhatsApp</DialogTitle></DialogHeader>
          {msgModal.loading ? <div className="space-y-2 py-4"><Skeleton className="h-4 w-full bg-muted" /><Skeleton className="h-4 w-5/6 bg-muted" /><Skeleton className="h-4 w-4/6 bg-muted" /></div> : <Textarea className="min-h-[160px] resize-none text-sm" value={msgModal.text} onChange={(e) => setMsgModal((m) => ({ ...m, text: e.target.value }))} />}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setMsgModal((m) => ({ ...m, open: false }))}>Fechar</Button>
            <Button disabled={msgModal.loading || !msgModal.text} onClick={() => navigator.clipboard.writeText(msgModal.text).then(() => toast.success('Mensagem copiada.')).catch(() => toast.error('Não foi possível copiar.'))}>Copiar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
