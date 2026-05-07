'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/lib/auth/auth-context'
import { DashboardHeader } from '@/components/dashboard/header'
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
import {
  Briefcase, TrendingUp, Phone, CheckCircle2, XCircle,
  ChevronRight, Medal, DollarSign,
} from 'lucide-react'
import { api } from '@/lib/api/client'
import { toast } from 'sonner'
import type { CarteiraOpportunity, OpportunityStatus, RankingEntry } from '@/types'

const STATUS_LABELS: Record<OpportunityStatus, string> = {
  to_contact: 'A contatar',
  contacted: 'Contatado',
  won: 'Ganho',
  lost: 'Perdido',
}

const STATUS_COLORS: Record<OpportunityStatus, string> = {
  to_contact: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  contacted: 'bg-blue-100 text-blue-800 border-blue-200',
  won: 'bg-green-100 text-green-800 border-green-200',
  lost: 'bg-red-100 text-red-800 border-red-200',
}

const STATUS_ICONS: Record<OpportunityStatus, React.ReactNode> = {
  to_contact: <Phone className="h-3.5 w-3.5" />,
  contacted: <ChevronRight className="h-3.5 w-3.5" />,
  won: <CheckCircle2 className="h-3.5 w-3.5" />,
  lost: <XCircle className="h-3.5 w-3.5" />,
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

function StatusBadge({ status }: { status: OpportunityStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[status]}`}
    >
      {STATUS_ICONS[status]}
      {STATUS_LABELS[status]}
    </span>
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
          <DialogTitle>{opp?.customer}</DialogTitle>
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
  const { company } = useAuth()
  const [opportunities, setOpportunities] = useState<CarteiraOpportunity[]>([])
  const [ranking, setRanking] = useState<RankingEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedOpp, setSelectedOpp] = useState<CarteiraOpportunity | null>(null)
  const [statusFilter, setStatusFilter] = useState<OpportunityStatus | 'all'>('all')

  const load = useCallback(async () => {
    if (!company?.id) return
    setIsLoading(true)
    const [oppsRes, rankRes] = await Promise.all([
      api.carteira.list(company.id),
      api.carteira.getRanking(company.id),
    ])
    if (oppsRes.success && oppsRes.data) setOpportunities(oppsRes.data)
    if (rankRes.success && rankRes.data) setRanking(rankRes.data)
    setIsLoading(false)
  }, [company?.id])

  useEffect(() => { load() }, [load])

  const filtered = statusFilter === 'all'
    ? opportunities
    : opportunities.filter((o) => o.action.status === statusFilter)

  const counts = {
    all: opportunities.length,
    to_contact: opportunities.filter((o) => o.action.status === 'to_contact').length,
    contacted: opportunities.filter((o) => o.action.status === 'contacted').length,
    won: opportunities.filter((o) => o.action.status === 'won').length,
    lost: opportunities.filter((o) => o.action.status === 'lost').length,
  }

  const totalWon = ranking.reduce((sum, r) => sum + r.totalWonValue, 0)

  return (
    <div className="flex flex-col">
      <DashboardHeader
        title="Carteira Ativa"
        description="Gerencie o status comercial das oportunidades identificadas"
      />
      <div className="flex-1 p-6 space-y-6">

        <Tabs defaultValue="oportunidades">
          <TabsList>
            <TabsTrigger value="oportunidades">
              <Briefcase className="h-4 w-4 mr-2" />
              Oportunidades
            </TabsTrigger>
            <TabsTrigger value="ranking">
              <Medal className="h-4 w-4 mr-2" />
              Ranking
            </TabsTrigger>
          </TabsList>

          {/* Tab Oportunidades */}
          <TabsContent value="oportunidades" className="space-y-4 mt-4">
            {/* Filtros rápidos */}
            <div className="flex flex-wrap gap-2">
              {(['all', 'to_contact', 'contacted', 'won', 'lost'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors
                    ${statusFilter === s
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'hover:bg-muted border-border text-muted-foreground'
                    }`}
                >
                  {s === 'all' ? 'Todas' : STATUS_LABELS[s]}
                  <span className="rounded-full bg-current/10 px-1.5">{counts[s]}</span>
                </button>
              ))}
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <Spinner className="h-8 w-8" />
              </div>
            ) : filtered.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                  <Briefcase className="h-12 w-12 mb-4 opacity-25" />
                  <p className="text-sm font-medium">Nenhuma oportunidade</p>
                  <p className="text-xs mt-1">Processe uma base de vendas para gerar oportunidades.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-3">
                {filtered.map((opp) => (
                  <Card
                    key={opp.id}
                    className="cursor-pointer hover:border-primary/50 transition-colors"
                    onClick={() => setSelectedOpp(opp)}
                  >
                    <CardContent className="flex items-center justify-between p-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm">{opp.customer}</p>
                          {opp.daysInactive > 0 && (
                            <span className="text-xs text-muted-foreground">
                              {opp.daysInactive} dias inativo
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-semibold text-green-700">
                            {formatCurrency(opp.expectedValue)}
                          </span>
                          <Badge variant="outline" className="text-xs capitalize">
                            {opp.confidence}
                          </Badge>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <StatusBadge status={opp.action.status} />
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Tab Ranking */}
          <TabsContent value="ranking" className="space-y-4 mt-4">
            {ranking.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-green-600" />
                    Total convertido
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold text-green-700">{formatCurrency(totalWon)}</p>
                </CardContent>
              </Card>
            )}

            {isLoading ? (
              <div className="flex justify-center py-10"><Spinner className="h-6 w-6" /></div>
            ) : ranking.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Medal className="h-10 w-10 mb-3 opacity-25" />
                  <p className="text-sm">Nenhuma ação registrada ainda.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {ranking.map((entry, idx) => (
                  <Card key={entry.userId}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold
                            ${idx === 0 ? 'bg-yellow-100 text-yellow-700' :
                              idx === 1 ? 'bg-gray-100 text-gray-600' :
                              idx === 2 ? 'bg-orange-100 text-orange-700' : 'bg-muted text-muted-foreground'}`}
                          >
                            {idx + 1}
                          </div>
                          <div>
                            <p className="font-medium text-sm">{entry.userName}</p>
                            <p className="text-xs text-muted-foreground">
                              {entry.conversionRate}% de conversão
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-green-700 text-sm">
                            {formatCurrency(entry.totalWonValue)}
                          </p>
                          <p className="text-xs text-muted-foreground">{entry.won} ganhos</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-4 gap-2 text-center">
                        {(
                          [
                            ['A contatar', entry.toContact, 'text-yellow-700'],
                            ['Contatado', entry.contacted, 'text-blue-700'],
                            ['Ganho', entry.won, 'text-green-700'],
                            ['Perdido', entry.lost, 'text-red-700'],
                          ] as const
                        ).map(([label, count, color]) => (
                          <div key={label} className="rounded-lg bg-muted/50 py-2">
                            <p className={`text-lg font-bold ${color}`}>{count}</p>
                            <p className="text-xs text-muted-foreground">{label}</p>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <ActionDialog
        opp={selectedOpp}
        onClose={() => setSelectedOpp(null)}
        onSaved={load}
        companyId={company?.id ?? ''}
      />
    </div>
  )
}
