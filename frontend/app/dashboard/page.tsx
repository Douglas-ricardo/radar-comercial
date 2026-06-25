//app/dashboard/page.tsx
'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { Sparkles, TrendingUp, Inbox, Clock } from 'lucide-react'

import { toast } from 'sonner'
import { useAuth } from '@/lib/auth/auth-context'
import { api, opportunitiesApi } from '@/lib/api/client'
import { cn, formatCurrency } from '@/lib/utils'
import type { InsightsData, CarteiraOpportunity, RecoverySummary, ForecastData } from '@/types'

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
  const [forecast, setForecast] = useState<ForecastData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [msg, setMsg] = useState<{ open: boolean; text: string; loading: boolean }>({
    open: false, text: '', loading: false,
  })

  useEffect(() => {
    async function load() {
      if (!company?.id) return
      setIsLoading(true)
      try {
        const [insRes, cartRes, recRes, forecastRes] = await Promise.all([
          api.insights.get(company.id, { dateRange: '6m' }),
          api.carteira.list(company.id),
          api.outreach.getRecovery(),
          api.insights.getForecast(company.id, '6m').catch(() => null),
        ])
        if (insRes.success && insRes.data) setInsights(insRes.data)
        if (cartRes.success && cartRes.data) {
          const all = cartRes.data
          setQueue(
            all
              .filter((o) => o.action.status === 'to_contact')
              .sort((a, b) =>
                (b.priorityValue ?? b.expectedValue) - (a.priorityValue ?? a.expectedValue),
              ),
          )
          setWonCount(all.filter((o) => o.action.status === 'won').length)
          setTotalActions(all.length)
        }
        if (recRes.success && recRes.data) setRecovery(recRes.data)
        if (forecastRes?.success && forecastRes.data) setForecast(forecastRes.data)
      } catch {
        toast.error('Não foi possível carregar o painel. Tente novamente.')
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
      if (res.success && res.data) {
        setMsg({ open: true, loading: false, text: res.data.message })
        toast.success('Mensagem gerada.')
      } else {
        setMsg({ open: true, loading: false, text: 'Não foi possível gerar agora. Verifique a integração de IA em Configurações.' })
      }
    } catch {
      setMsg({ open: true, loading: false, text: 'Não foi possível gerar agora. Verifique a integração de IA em Configurações.' })
    }
  }

  const recoverableNow = queue.reduce((s, o) => s + o.expectedValue, 0)
  const conversion = totalActions > 0 ? Math.round((wonCount / totalActions) * 100) : null

  const kpis = [
    { label: 'Recuperado', value: formatCurrency(recovery?.totalRecovered ?? 0), tone: 'text-success' },
    { label: 'Em risco', value: formatCurrency(insights?.summary?.lostRevenue ?? 0), tone: 'text-destructive' },
    { label: 'Conversão da carteira', value: conversion !== null ? `${conversion}%` : 'Sem contatos', tone: 'text-foreground' },
    { label: 'Clientes ativos', value: String(insights?.summary?.uniqueCustomers ?? '—'), tone: 'text-foreground' },
  ]

  return (
    <div className="flex flex-col min-h-screen">
      <DashboardHeader
        title={`Olá, ${user?.name?.split(' ')[0] || 'Usuário'}`}
        description="Seu painel de trabalho do dia"
      />

      <div className="flex-1 space-y-6 p-6 lg:p-8 max-w-[1400px] mx-auto w-full">
        {/* 1 · HERO + 2 · fila "quem contatar hoje" */}
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="flex flex-col justify-between rounded-2xl border-primary/20 bg-accent/40 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Para recuperar agora
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {isLoading ? (
                <Skeleton className="h-12 w-44 bg-muted" />
              ) : (
                <>
                  <p className="font-[family-name:var(--font-display)] text-5xl font-extrabold leading-none tracking-[-0.02em] text-primary tabular-nums">
                    {formatCurrency(recoverableNow)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    <span className="font-medium text-foreground tabular-nums">{queue.length}</span>{' '}
                    clientes na fila para contatar
                  </p>
                  {recovery && recovery.totalRecovered > 0 && (
                    <div className="flex items-center gap-1.5 text-sm font-medium text-success">
                      <TrendingUp className="h-4 w-4" aria-hidden />
                      {formatCurrency(recovery.totalRecovered)} recuperado no período
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          <Card className="flex flex-col rounded-2xl shadow-sm lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="font-[family-name:var(--font-display)] text-lg font-bold tracking-[-0.02em]">Quem contatar hoje</CardTitle>
                <CardDescription>Priorizado por valor e chance de retorno</CardDescription>
              </div>
              <Link href="/dashboard/carteira">
                <Button variant="ghost" size="sm" className="text-primary hover:bg-accent hover:text-primary">Ver carteira</Button>
              </Link>
            </CardHeader>
            <CardContent className="flex-1">
              {isLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-14 w-full rounded-xl bg-muted" />)}
                </div>
              ) : queue.length === 0 ? (
                <Empty className="py-10">
                  <EmptyMedia variant="icon" className="bg-accent text-primary"><Inbox /></EmptyMedia>
                  <EmptyTitle>Fila vazia</EmptyTitle>
                  <EmptyDescription>Importe uma base de vendas para o Radar mapear quem contatar.</EmptyDescription>
                </Empty>
              ) : (
                <div className="space-y-2">
                  {queue.slice(0, 6).map((opp) => {
                    const conf = CONFIDENCE[opp.confidence] ?? CONFIDENCE.medium
                    const recovTone =
                      opp.recoveryBand === 'alta' ? 'text-success'
                      : opp.recoveryBand === 'media' ? 'text-warning'
                      : 'text-muted-foreground'
                    return (
                      <div
                        key={opp.id}
                        className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 transition-all hover:border-primary/30 hover:shadow-sm"
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
                            <p className="text-sm font-semibold tabular-nums text-primary">{formatCurrency(opp.expectedValue)}</p>
                            {opp.recoveryBand && typeof opp.recoveryScore === 'number' ? (
                              <span className={cn('flex items-center justify-end gap-1 text-[11px] font-medium tabular-nums', recovTone)}>
                                <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
                                {opp.recoveryScore} · {opp.recoveryBand === 'media' ? 'média' : opp.recoveryBand}
                              </span>
                            ) : (
                              <span className={cn('flex items-center justify-end gap-1 text-[11px] font-medium', conf.tone)}>
                                <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden /> {conf.label}
                              </span>
                            )}
                          </div>
                          {(user?.role === 'admin' || user?.role === 'analyst') && (
                            <Button
                              size="sm" variant="ghost"
                              className="h-7 gap-1.5 text-xs text-primary hover:bg-accent hover:text-primary"
                              onClick={() => generateMessage(opp)}
                            >
                              <Sparkles className="h-3.5 w-3.5" /> Gerar
                            </Button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* 3 · KPIs de apoio */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {kpis.map((k) => (
            <Card key={k.label} className="rounded-2xl shadow-sm">
              <CardHeader className="pb-1">
                <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{k.label}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className={cn('font-[family-name:var(--font-display)] text-2xl font-bold tracking-[-0.02em] tabular-nums', k.tone)}>{isLoading ? '—' : k.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* 4 · Tendência (apoio) */}
        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="font-[family-name:var(--font-display)] text-lg font-bold tracking-[-0.02em]">Tendência</CardTitle>
            <CardDescription>Receita capturada versus perdida (6 meses)</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[240px] w-full rounded-xl bg-muted" />
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
        {/* 5 · Previsão de receita — oculta quando todos os valores são zero (sem base histórica) */}
        {(isLoading || (forecast && forecast.months.some((m) => m.projectedRevenue > 0))) && (
          <Card className="rounded-2xl shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="font-[family-name:var(--font-display)] text-lg font-bold tracking-[-0.02em]">Previsão de receita</CardTitle>
              <CardDescription>
                {forecast ? (
                  <>
                    Projeção para os próximos 3 meses
                    {forecast.trend === 'up' && <span className="ml-1.5 text-success font-medium">↑ tendência de crescimento</span>}
                    {forecast.trend === 'down' && <span className="ml-1.5 text-destructive font-medium">↓ tendência de queda</span>}
                    {forecast.trend === 'flat' && <span className="ml-1.5 text-muted-foreground font-medium">→ estável</span>}
                  </>
                ) : 'Projeção para os próximos 3 meses'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading || !forecast ? (
                <Skeleton className="h-[80px] w-full rounded-xl bg-muted" />
              ) : (
                <div className="grid grid-cols-3 gap-4">
                  {forecast.months.map((m, i) => (
                    <div key={m.month} className={cn('rounded-xl border border-border p-4 space-y-1', i === 0 && 'border-primary/30 bg-accent/40')}>
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{m.month}</p>
                      <p className={cn('font-[family-name:var(--font-display)] text-xl font-bold tracking-[-0.02em] tabular-nums', forecast.trend === 'up' ? 'text-success' : forecast.trend === 'down' ? 'text-destructive' : 'text-foreground')}>
                        {formatCurrency(m.projectedRevenue)}
                      </p>
                      <p className="text-[11px] text-muted-foreground tabular-nums">
                        {formatCurrency(m.confidenceLow)} — {formatCurrency(m.confidenceHigh)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
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
              <Skeleton className="h-4 w-full bg-muted" /><Skeleton className="h-4 w-5/6 bg-muted" /><Skeleton className="h-4 w-4/6 bg-muted" />
            </div>
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
