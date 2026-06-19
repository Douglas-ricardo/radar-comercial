//app/dashboard/page.tsx
'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { Sparkles, TrendingUp, Inbox, Clock } from 'lucide-react'

import { useAuth } from '@/lib/auth/auth-context'
import { api, opportunitiesApi } from '@/lib/api/client'
import { cn, formatCurrency } from '@/lib/utils'
import type { InsightsData, CarteiraOpportunity, RecoverySummary } from '@/types'

import { DashboardHeader } from '@/components/dashboard/header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Empty, EmptyTitle, EmptyDescription, EmptyMedia } from '@/components/ui/empty'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'

const chartConfig = {
  receita: { label: 'Receita', color: 'var(--color-chart-1)' },
  perdida: { label: 'Perdida', color: 'var(--color-destructive)' },
}

const CONFIDENCE: Record<string, { tone: string; label: string }> = {
  high: { tone: 'text-success', label: 'alta' },
  medium: { tone: 'text-warning', label: 'média' },
  low: { tone: 'text-muted-foreground', label: 'baixa' },
}

export default function DashboardPage() {
  const { user, company } = useAuth()
  const [insights, setInsights] = useState<InsightsData | null>(null)
  const [queue, setQueue] = useState<CarteiraOpportunity[]>([])
  const [wonCount, setWonCount] = useState(0)
  const [totalActions, setTotalActions] = useState(0)
  const [recovery, setRecovery] = useState<RecoverySummary | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [msg, setMsg] = useState<{ open: boolean; text: string; loading: boolean }>({
    open: false, text: '', loading: false,
  })

  useEffect(() => {
    async function load() {
      if (!company?.id) return
      setIsLoading(true)
      try {
        const [insRes, cartRes, recRes] = await Promise.all([
          api.insights.get(company.id, { dateRange: '6m' }),
          api.carteira.list(company.id),
          api.outreach.getRecovery(),
        ])
        if (insRes.success && insRes.data) setInsights(insRes.data)
        if (cartRes.success && cartRes.data) {
          const all = cartRes.data
          setQueue(
            all
              .filter((o) => o.action.status === 'to_contact')
              .sort((a, b) => b.expectedValue - a.expectedValue),
          )
          setWonCount(all.filter((o) => o.action.status === 'won').length)
          setTotalActions(all.length)
        }
        if (recRes.success && recRes.data) setRecovery(recRes.data)
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [company?.id])

  async function generateMessage(opp: CarteiraOpportunity) {
    setMsg({ open: true, text: '', loading: true })
    try {
      const res = await opportunitiesApi.generateMessage(opp.id, opp.customerHash, '1m')
      setMsg({ open: true, loading: false, text: res.success && res.data ? res.data.message : 'Erro ao gerar mensagem. Tente novamente.' })
    } catch {
      setMsg({ open: true, loading: false, text: 'Erro ao gerar mensagem. Tente novamente.' })
    }
  }

  const recoverableNow = queue.reduce((s, o) => s + o.expectedValue, 0)
  const conversion = totalActions > 0 ? Math.round((wonCount / totalActions) * 100) : 0

  const kpis = [
    { label: 'Recuperado', value: formatCurrency(recovery?.totalRecovered ?? 0), tone: 'text-success' },
    { label: 'Em risco', value: formatCurrency(insights?.summary?.lostRevenue ?? 0), tone: 'text-destructive' },
    { label: 'Conversão da carteira', value: `${conversion}%`, tone: 'text-foreground' },
    { label: 'Clientes ativos', value: String(insights?.summary?.uniqueCustomers ?? '—'), tone: 'text-foreground' },
  ]

  return (
    <div className="flex flex-col min-h-screen">
      <DashboardHeader
        title={`Olá, ${user?.name?.split(' ')[0] || 'Usuário'}`}
        description="Seu painel de trabalho do dia"
      />

      <div className="flex-1 space-y-6 p-6 md:p-8 max-w-[1400px] mx-auto w-full">
        {/* 1 · HERO + 2 · fila "quem contatar hoje" */}
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="flex flex-col justify-between border-primary/20 bg-primary/[0.03]">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Para recuperar agora
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {isLoading ? (
                <Skeleton className="h-12 w-44" />
              ) : (
                <>
                  <p className="font-serif text-5xl leading-none text-primary tabular-nums">
                    {formatCurrency(recoverableNow)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    <span className="font-medium text-foreground tabular-nums">{queue.length}</span>{' '}
                    clientes na fila para contatar
                  </p>
                  {recovery && recovery.totalRecovered > 0 && (
                    <div className="flex items-center gap-1.5 text-sm text-success">
                      <TrendingUp className="h-4 w-4" aria-hidden />
                      {formatCurrency(recovery.totalRecovered)} recuperado no período
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          <Card className="flex flex-col lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="font-serif text-lg font-medium tracking-[-0.01em]">Quem contatar hoje</CardTitle>
                <CardDescription>Priorizado por valor recuperável</CardDescription>
              </div>
              <Link href="/dashboard/carteira">
                <Button variant="ghost" size="sm" className="text-primary hover:text-primary/80">Ver carteira</Button>
              </Link>
            </CardHeader>
            <CardContent className="flex-1">
              {isLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
                </div>
              ) : queue.length === 0 ? (
                <Empty className="py-8">
                  <EmptyMedia variant="icon"><Inbox /></EmptyMedia>
                  <EmptyTitle>Fila vazia</EmptyTitle>
                  <EmptyDescription>Importe uma base de vendas para o Radar mapear quem contatar.</EmptyDescription>
                </Empty>
              ) : (
                <div className="space-y-2">
                  {queue.slice(0, 6).map((opp) => {
                    const conf = CONFIDENCE[opp.confidence] ?? CONFIDENCE.medium
                    return (
                      <div
                        key={opp.id}
                        className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:border-primary/40"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{opp.customer}</p>
                          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" aria-hidden />
                            <span className="tabular-nums">{opp.daysInactive}d sem comprar</span>
                            {opp.product && (<><span>·</span><span className="truncate">{opp.product}</span></>)}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-4">
                          <div className="text-right">
                            <p className="font-mono text-sm tabular-nums text-primary">{formatCurrency(opp.expectedValue)}</p>
                            <span className={cn('flex items-center justify-end gap-1 text-[11px] font-medium', conf.tone)}>
                              <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden /> {conf.label}
                            </span>
                          </div>
                          <Button
                            size="sm" variant="ghost"
                            className="h-7 gap-1.5 text-xs text-primary hover:bg-primary/5"
                            onClick={() => generateMessage(opp)}
                          >
                            <Sparkles className="h-3.5 w-3.5" /> Gerar
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* 3 · KPIs de apoio (Geist Mono tabular, não serifa) */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {kpis.map((k) => (
            <Card key={k.label}>
              <CardHeader className="pb-1">
                <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{k.label}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className={cn('font-mono text-2xl tabular-nums', k.tone)}>{isLoading ? '—' : k.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* 4 · Tendência (apoio) */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="font-serif text-lg font-medium tracking-[-0.01em]">Tendência</CardTitle>
            <CardDescription>Receita capturada versus perdida (6 meses)</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[240px] w-full rounded-lg" />
            ) : (
              <ChartContainer config={chartConfig} className="h-[240px] w-full">
                <AreaChart data={insights?.charts?.timeSeries || []} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="dRec" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="var(--color-chart-1)" stopOpacity={0.18} /><stop offset="95%" stopColor="var(--color-chart-1)" stopOpacity={0} /></linearGradient>
                    <linearGradient id="dPer" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="var(--color-destructive)" stopOpacity={0.18} /><stop offset="95%" stopColor="var(--color-destructive)" stopOpacity={0} /></linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
                  <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }} tickFormatter={(v) => `R$ ${v / 1000}k`} dx={-10} />
                  <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dot" />} />
                  <Area type="monotone" dataKey="receita" stroke="var(--color-chart-1)" fill="url(#dRec)" strokeWidth={2} />
                  <Area type="monotone" dataKey="perdida" stroke="var(--color-destructive)" fill="url(#dPer)" strokeWidth={2} />
                </AreaChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Modal de mensagem IA */}
      <Dialog open={msg.open} onOpenChange={(o) => setMsg((m) => ({ ...m, open: o }))}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Mensagem para WhatsApp</DialogTitle>
            <DialogDescription>Edite se necessário antes de copiar.</DialogDescription>
          </DialogHeader>
          {msg.loading ? (
            <div className="space-y-2 py-4">
              <Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-5/6" /><Skeleton className="h-4 w-4/6" />
            </div>
          ) : (
            <Textarea className="min-h-[160px] resize-none text-sm" value={msg.text} onChange={(e) => setMsg((m) => ({ ...m, text: e.target.value }))} />
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setMsg((m) => ({ ...m, open: false }))}>Fechar</Button>
            <Button disabled={msg.loading || !msg.text} onClick={() => navigator.clipboard.writeText(msg.text)}>Copiar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
