'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/lib/auth/auth-context'
import { DashboardHeader } from '@/components/dashboard/header'
import {
  Card, CardContent, CardHeader, CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { OpportunityCard } from '@/components/opportunities/opportunity-card'
import { Spinner } from '@/components/ui/spinner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Field, FieldLabel } from '@/components/ui/field'
import { Briefcase, Medal, DollarSign, ArrowRight, Filter, X, Download, BarChart3 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { api, opportunitiesApi, reportsApi } from '@/lib/api/client'
import { cn, formatCurrency } from '@/lib/utils'
import { toast } from 'sonner'
import { Skeleton } from '@/components/ui/skeleton'
import type { CarteiraOpportunity, GerencialData, OpportunityStatus, RankingEntry } from '@/types'

const STATUS_LABELS: Record<OpportunityStatus, string> = {
  to_contact: 'A contatar',
  contacted: 'Contatado',
  won: 'Ganho',
  lost: 'Perdido',
}

const COLUMNS: { status: OpportunityStatus; label: string; dot: string }[] = [
  { status: 'to_contact', label: 'A contatar', dot: 'bg-warning' },
  { status: 'contacted', label: 'Contatado', dot: 'bg-primary' },
  { status: 'won', label: 'Ganho', dot: 'bg-success' },
  { status: 'lost', label: 'Perdido', dot: 'bg-destructive' },
]

function FunnelStage({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn('mt-0.5 text-sm font-semibold tabular-nums', tone ?? 'text-foreground')}>{formatCurrency(value)}</p>
    </div>
  )
}

interface ActionDialogProps {
  opp: CarteiraOpportunity | null
  onClose: () => void
  onSaved: () => void
  companyId: string
}

function ActionDialog({ opp, onClose, onSaved, companyId }: ActionDialogProps) {
  const [status, setStatus] = useState<OpportunityStatus>('to_contact')
  const [notes, setNotes] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (opp) {
      setStatus(opp.action.status)
      setNotes(opp.action.notes ?? '')
    }
  }, [opp])

  const handleSave = async () => {
    if (!opp) return
    setIsSaving(true)
    try {
      const res = await api.carteira.upsertAction(companyId, {
        opportunity_id: opp.customerHash || opp.id,
        customer_name: opp.customer,
        expected_value: opp.expectedValue,
        status,
        notes: notes || null,
      })
      if (res.success) {
        toast.success('Ação registrada.')
        onSaved()
        onClose()
      } else {
        toast.error(res.error ?? 'Erro ao salvar.')
      }
    } catch {
      toast.error('Erro de conexão.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={!!opp} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-[family-name:var(--font-display)] font-bold tracking-[-0.02em]">{opp?.customer}</DialogTitle>
          <DialogDescription>
            Valor esperado: {opp ? formatCurrency(opp.expectedValue) : '—'}
            {opp?.daysInactive ? ` · ${opp.daysInactive} dias sem comprar` : ''}
          </DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel>Status comercial</FieldLabel>
          <Select value={status} onValueChange={(v) => setStatus(v as OpportunityStatus)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(STATUS_LABELS) as OpportunityStatus[]).map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel>Anotações</FieldLabel>
          <Textarea
            placeholder="Ex: Cliente retornou ligação, proposta enviada..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
          />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving && <Spinner className="mr-2 h-4 w-4" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function CarteiraPage() {
  const { company, user } = useAuth()
  const canUseAI = user?.role === 'admin' || user?.role === 'analyst'
  const isAdmin = user?.role === 'admin'
  const [opportunities, setOpportunities] = useState<CarteiraOpportunity[]>([])
  const [ranking, setRanking] = useState<RankingEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedOpp, setSelectedOpp] = useState<CarteiraOpportunity | null>(null)
  const [gerencial, setGerencial] = useState<GerencialData | null>(null)
  const [msgModal, setMsgModal] = useState<{ open: boolean; text: string; loading: boolean }>({
    open: false, text: '', loading: false,
  })
  // Filtros de segmentação (só admin vê o filtro de filial/vendedor)
  const [filterBranch, setFilterBranch] = useState('')
  const [filterSalesperson, setFilterSalesperson] = useState('')
  const [appliedBranch, setAppliedBranch] = useState('')
  const [appliedSalesperson, setAppliedSalesperson] = useState('')

  async function handleGenerateMessage(opp: CarteiraOpportunity) {
    setMsgModal({ open: true, text: '', loading: true })
    try {
      const res = await opportunitiesApi.generateMessage(opp.id, opp.customerHash, '1m')
      if (res.success && res.data) {
        setMsgModal({ open: true, text: res.data.message, loading: false })
      } else {
        setMsgModal({ open: true, text: 'Erro ao gerar mensagem. Tente novamente.', loading: false })
      }
    } catch {
      setMsgModal({ open: true, text: 'Erro ao gerar mensagem. Tente novamente.', loading: false })
    }
  }

  const load = useCallback(async (branch?: string, salesperson?: string) => {
    if (!company?.id) return
    setIsLoading(true)
    const requests: Promise<unknown>[] = [
      api.carteira.list(company.id, undefined, branch || undefined, salesperson || undefined),
      api.carteira.getRanking(company.id),
    ]
    if (isAdmin) requests.push(api.carteira.getGerencial(company.id))
    const [oppsRes, rankRes, gerencialRes] = await Promise.all(requests) as [
      Awaited<ReturnType<typeof api.carteira.list>>,
      Awaited<ReturnType<typeof api.carteira.getRanking>>,
      Awaited<ReturnType<typeof api.carteira.getGerencial>> | undefined,
    ]
    if (oppsRes.success && oppsRes.data) setOpportunities(oppsRes.data)
    if (rankRes.success && rankRes.data) setRanking(rankRes.data)
    if (gerencialRes?.success && gerencialRes?.data) setGerencial(gerencialRes.data)
    setIsLoading(false)
  }, [company?.id, isAdmin])

  useEffect(() => { load() }, [load])

  const applyFilters = () => {
    setAppliedBranch(filterBranch)
    setAppliedSalesperson(filterSalesperson)
    load(filterBranch, filterSalesperson)
  }

  const clearFilters = () => {
    setFilterBranch('')
    setFilterSalesperson('')
    setAppliedBranch('')
    setAppliedSalesperson('')
    load()
  }

  const hasActiveFilters = appliedBranch || appliedSalesperson

  const byStatus: Record<OpportunityStatus, CarteiraOpportunity[]> = {
    to_contact: opportunities.filter((o) => o.action.status === 'to_contact'),
    contacted: opportunities.filter((o) => o.action.status === 'contacted'),
    won: opportunities.filter((o) => o.action.status === 'won'),
    lost: opportunities.filter((o) => o.action.status === 'lost'),
  }
  const sumVal = (arr: CarteiraOpportunity[]) => arr.reduce((s, o) => s + o.expectedValue, 0)
  const identified = sumVal(opportunities)
  const contactedVal = sumVal([...byStatus.contacted, ...byStatus.won, ...byStatus.lost])
  const wonVal = sumVal(byStatus.won)
  const roi = identified > 0 ? Math.round((wonVal / identified) * 100) : 0

  const totalWon = ranking.reduce((sum, r) => sum + r.totalWonValue, 0)

  return (
    <div className="flex flex-col">
      <DashboardHeader
        title="Carteira Ativa"
        description="Gerencie o status comercial das oportunidades identificadas"
      />
      <div className="flex-1 p-6 lg:p-8 space-y-6">

        {/* Filtros de segmentação — só admins veem (analistas têm scope automático) */}
        {isAdmin && (
          <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-3">
            <Filter className="h-4 w-4 text-muted-foreground mt-1 shrink-0" />
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">Filial</label>
              <Input
                className="h-8 w-36 text-sm"
                placeholder="ex: SP-001"
                value={filterBranch}
                onChange={(e) => setFilterBranch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && applyFilters()}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">Vendedor</label>
              <Input
                className="h-8 w-36 text-sm"
                placeholder="nome ou código"
                value={filterSalesperson}
                onChange={(e) => setFilterSalesperson(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && applyFilters()}
              />
            </div>
            <Button size="sm" variant="outline" className="h-8" onClick={applyFilters}>
              Filtrar
            </Button>
            {hasActiveFilters && (
              <Button size="sm" variant="ghost" className="h-8 text-muted-foreground" onClick={clearFilters}>
                <X className="h-3.5 w-3.5 mr-1" />
                Limpar
              </Button>
            )}
          </div>
        )}

        <Tabs defaultValue="oportunidades">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <TabsList>
              <TabsTrigger value="oportunidades">
                <Briefcase className="h-4 w-4 mr-2" />
                Oportunidades
              </TabsTrigger>
              <TabsTrigger value="ranking">
                <Medal className="h-4 w-4 mr-2" />
                Ranking
              </TabsTrigger>
              {isAdmin && (
                <TabsTrigger value="gerencial">
                  <BarChart3 className="h-4 w-4 mr-2" />
                  Gerencial
                </TabsTrigger>
              )}
            </TabsList>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => {
                const url = reportsApi.excelUrl(company?.id ?? '', {
                  dateRange: '1m',
                  branch: appliedBranch || undefined,
                  salesperson: appliedSalesperson || undefined,
                })
                window.open(url, '_blank')
              }}
            >
              <Download className="h-4 w-4" />
              Exportar Excel
            </Button>
          </div>

          {/* Tab Oportunidades — funil + board por status */}
          <TabsContent value="oportunidades" className="space-y-5 mt-4">
            {/* Funil + ROI */}
            {!isLoading && opportunities.length > 0 && (
              <Card className="rounded-2xl border border-border bg-card shadow-sm">
                <CardContent className="flex flex-wrap items-center justify-between gap-6 py-5">
                  <div className="flex items-center gap-3">
                    <FunnelStage label="Identificado" value={identified} />
                    <ArrowRight className="h-4 w-4 text-muted-foreground/60" aria-hidden />
                    <FunnelStage label="Contatado" value={contactedVal} tone="text-primary" />
                    <ArrowRight className="h-4 w-4 text-muted-foreground/60" aria-hidden />
                    <FunnelStage label="Ganho" value={wonVal} tone="text-success" />
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">ROI da carteira</p>
                    <p className="font-[family-name:var(--font-display)] text-3xl font-extrabold leading-none tracking-[-0.02em] text-primary tabular-nums">{roi}%</p>
                  </div>
                </CardContent>
              </Card>
            )}

            {isLoading ? (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {COLUMNS.map((col) => (
                  <div key={col.status} className="flex flex-col rounded-2xl border border-border bg-secondary/30">
                    <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
                      <span className="flex items-center gap-2 text-sm font-medium">
                        <span className={cn('h-2 w-2 rounded-full', col.dot)} aria-hidden />
                        {col.label}
                      </span>
                    </div>
                    <div className="flex-1 space-y-2 p-2">
                      <div className="h-16 rounded-xl bg-muted animate-pulse" />
                      <div className="h-16 rounded-xl bg-muted animate-pulse" />
                    </div>
                  </div>
                ))}
              </div>
            ) : opportunities.length === 0 ? (
              <Card className="rounded-2xl border border-border bg-card shadow-sm">
                <CardContent className="flex flex-col items-center justify-center py-20 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent text-primary">
                    <Briefcase className="h-7 w-7" />
                  </div>
                  <p className="mt-4 font-[family-name:var(--font-display)] text-lg font-bold tracking-[-0.02em] text-foreground">Nenhuma oportunidade ainda</p>
                  <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                    Processe uma base de vendas para identificar clientes que pararam de comprar e gerar oportunidades de recuperação.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {COLUMNS.map((col) => {
                  const items = byStatus[col.status]
                  return (
                    <div key={col.status} className="flex flex-col rounded-2xl border border-border bg-secondary/30">
                      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
                        <span className="flex items-center gap-2 text-sm font-medium">
                          <span className={cn('h-2 w-2 rounded-full', col.dot)} aria-hidden />
                          {col.label}
                          <span className="rounded-full bg-muted px-1.5 text-xs tabular-nums text-muted-foreground">{items.length}</span>
                        </span>
                        <span className="text-xs font-semibold tabular-nums text-muted-foreground">{formatCurrency(sumVal(items))}</span>
                      </div>
                      <div className="flex-1 space-y-2 p-2">
                        {items.length === 0 ? (
                          <p className="py-10 text-center text-xs text-muted-foreground">Nada por aqui</p>
                        ) : (
                          items.map((opp) => (
                            <OpportunityCard
                              key={opp.id}
                              compact
                              customer={opp.customer}
                              expectedValue={opp.expectedValue}
                              daysInactive={opp.daysInactive}
                              product={opp.product}
                              frequency={opp.frequency}
                              confidence={opp.confidence}
                              onOpen={() => setSelectedOpp(opp)}
                              onGenerateMessage={canUseAI ? () => handleGenerateMessage(opp) : undefined}
                            />
                          ))
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </TabsContent>

          {/* Tab Ranking */}
          <TabsContent value="ranking" className="space-y-4 mt-4">
            {ranking.length > 0 && (
              <Card className="rounded-2xl border border-border bg-card shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <DollarSign className="h-4 w-4 text-success" />
                    Total convertido
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="font-[family-name:var(--font-display)] text-3xl font-extrabold leading-none tracking-[-0.02em] text-success tabular-nums">{formatCurrency(totalWon)}</p>
                </CardContent>
              </Card>
            )}

            {isLoading ? (
              <div className="space-y-3">
                <div className="h-32 rounded-2xl bg-muted animate-pulse" />
                <div className="h-32 rounded-2xl bg-muted animate-pulse" />
              </div>
            ) : ranking.length === 0 ? (
              <Card className="rounded-2xl border border-border bg-card shadow-sm">
                <CardContent className="flex flex-col items-center justify-center py-20 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent text-primary">
                    <Medal className="h-7 w-7" />
                  </div>
                  <p className="mt-4 font-[family-name:var(--font-display)] text-lg font-bold tracking-[-0.02em] text-foreground">Ranking ainda vazio</p>
                  <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                    Registre o status comercial das oportunidades para ver a conversão por vendedor.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {ranking.map((entry, idx) => (
                  <Card key={entry.userId} className="rounded-2xl border border-border bg-card shadow-sm">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold tabular-nums
                            ${idx === 0 ? 'bg-warning/15 text-warning' :
                              idx === 1 ? 'bg-secondary text-foreground' :
                              'bg-muted text-muted-foreground'}`}
                          >
                            {idx + 1}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-foreground">{entry.userName}</p>
                            <p className="text-xs text-muted-foreground tabular-nums">
                              {entry.conversionRate}% de conversão
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-[family-name:var(--font-display)] text-xl font-bold leading-none tracking-[-0.02em] text-success tabular-nums">
                            {formatCurrency(entry.totalWonValue)}
                          </p>
                          <p className="text-xs text-muted-foreground tabular-nums mt-1">{entry.won} ganhos</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-4 gap-2 text-center">
                        {(
                          [
                            ['A contatar', entry.toContact, 'text-warning'],
                            ['Contatado', entry.contacted, 'text-primary'],
                            ['Ganho', entry.won, 'text-success'],
                            ['Perdido', entry.lost, 'text-destructive'],
                          ] as const
                        ).map(([label, count, color]) => (
                          <div key={label} className="rounded-xl border border-border bg-secondary/40 py-2">
                            <p className={`font-[family-name:var(--font-display)] text-xl font-bold tabular-nums ${color}`}>{count}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Tab Gerencial — admin only */}
          {isAdmin && (
            <TabsContent value="gerencial" className="space-y-5 mt-4">
              {isLoading ? (
                <div className="space-y-3">
                  <div className="h-40 rounded-2xl bg-muted animate-pulse" />
                  <div className="h-40 rounded-2xl bg-muted animate-pulse" />
                </div>
              ) : !gerencial || (gerencial.by_branch.length === 0 && gerencial.by_salesperson.length === 0) ? (
                <Card className="rounded-2xl border border-border bg-card shadow-sm">
                  <CardContent className="flex flex-col items-center justify-center py-20 text-center">
                    <BarChart3 className="h-10 w-10 text-muted-foreground mb-3" />
                    <p className="font-[family-name:var(--font-display)] text-lg font-bold tracking-[-0.02em]">Sem dados gerenciais</p>
                    <p className="text-sm text-muted-foreground mt-1">Upload um CSV com colunas de filial e vendedor para ver esta visão.</p>
                  </CardContent>
                </Card>
              ) : (
                <>
                  {/* Totais */}
                  {gerencial.totals && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {[
                        { label: 'Oportunidades', value: gerencial.totals.totalOpportunities, fmt: (v: number) => v.toString() },
                        { label: 'Valor em risco', value: gerencial.totals.totalValue, fmt: formatCurrency },
                        { label: 'Ganhos', value: gerencial.totals.won, fmt: (v: number) => v.toString() },
                        { label: 'Receita recuperada', value: gerencial.totals.wonValue, fmt: formatCurrency },
                      ].map(({ label, value, fmt }) => (
                        <Card key={label} className="rounded-2xl border border-border bg-card shadow-sm">
                          <CardContent className="p-4">
                            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
                            <p className="font-[family-name:var(--font-display)] text-2xl font-extrabold leading-tight tracking-[-0.02em] text-foreground tabular-nums mt-1">{fmt(value)}</p>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}

                  {/* Por Filial */}
                  {gerencial.by_branch.length > 0 && (
                    <Card className="rounded-2xl border border-border bg-card shadow-sm">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Por Filial</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                                <th className="pb-2 pr-4 font-medium">Filial</th>
                                <th className="pb-2 pr-4 font-medium text-right">Opor.</th>
                                <th className="pb-2 pr-4 font-medium text-right">Valor em risco</th>
                                <th className="pb-2 pr-4 font-medium text-right">Contat.</th>
                                <th className="pb-2 pr-4 font-medium text-right">Ganhos</th>
                                <th className="pb-2 font-medium text-right">Conversão</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                              {gerencial.by_branch.map((row) => (
                                <tr key={row.branch}>
                                  <td className="py-2 pr-4 font-medium text-foreground">{row.branch}</td>
                                  <td className="py-2 pr-4 text-right tabular-nums">{row.totalOpportunities}</td>
                                  <td className="py-2 pr-4 text-right tabular-nums">{formatCurrency(row.totalValue)}</td>
                                  <td className="py-2 pr-4 text-right tabular-nums text-primary">{row.contacted}</td>
                                  <td className="py-2 pr-4 text-right tabular-nums text-success">{row.won}</td>
                                  <td className="py-2 text-right tabular-nums">{row.conversionRate}%</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Por Vendedor */}
                  {gerencial.by_salesperson.length > 0 && (
                    <Card className="rounded-2xl border border-border bg-card shadow-sm">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Por Vendedor</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                                <th className="pb-2 pr-4 font-medium">Vendedor</th>
                                <th className="pb-2 pr-4 font-medium text-right">Opor.</th>
                                <th className="pb-2 pr-4 font-medium text-right">Valor em risco</th>
                                <th className="pb-2 pr-4 font-medium text-right">Contat.</th>
                                <th className="pb-2 pr-4 font-medium text-right">Ganhos</th>
                                <th className="pb-2 font-medium text-right">Conversão</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                              {gerencial.by_salesperson.map((row) => (
                                <tr key={row.salesperson}>
                                  <td className="py-2 pr-4 font-medium text-foreground">{row.salesperson}</td>
                                  <td className="py-2 pr-4 text-right tabular-nums">{row.totalOpportunities}</td>
                                  <td className="py-2 pr-4 text-right tabular-nums">{formatCurrency(row.totalValue)}</td>
                                  <td className="py-2 pr-4 text-right tabular-nums text-primary">{row.contacted}</td>
                                  <td className="py-2 pr-4 text-right tabular-nums text-success">{row.won}</td>
                                  <td className="py-2 text-right tabular-nums">{row.conversionRate}%</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </>
              )}
            </TabsContent>
          )}
        </Tabs>
      </div>

      <ActionDialog
        opp={selectedOpp}
        onClose={() => setSelectedOpp(null)}
        onSaved={load}
        companyId={company?.id ?? ''}
      />

      {/* ── Modal de mensagem gerada por IA ────────────────────────────── */}
      <Dialog open={msgModal.open} onOpenChange={(open) => setMsgModal(m => ({ ...m, open }))}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-[family-name:var(--font-display)] font-bold tracking-[-0.02em]">Mensagem para WhatsApp</DialogTitle>
            <DialogDescription>Edite se necessário antes de copiar.</DialogDescription>
          </DialogHeader>
          {msgModal.loading ? (
            <div className="space-y-2 py-4">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-4/6" />
            </div>
          ) : (
            <Textarea
              className="min-h-[160px] resize-none text-sm"
              value={msgModal.text}
              onChange={(e) => setMsgModal(m => ({ ...m, text: e.target.value }))}
            />
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setMsgModal(m => ({ ...m, open: false }))}>
              Fechar
            </Button>
            <Button
              disabled={msgModal.loading || !msgModal.text}
              onClick={() => navigator.clipboard.writeText(msgModal.text)}
            >
              Copiar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
