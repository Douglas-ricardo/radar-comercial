'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { DashboardHeader } from '@/components/dashboard/header'
import { ProtectedRoute } from '@/lib/auth/protected-route'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import {
  MessageCircle, Mail, Send, Smartphone, CheckCircle2, AlertTriangle, Loader2, Pencil, TrendingUp,
  ChevronDown, Settings2, Inbox,
} from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { api } from '@/lib/api/client'
import { toast } from 'sonner'
import type { OutreachConfig, OutreachContact, RecoverySummary, ChurnRiskData, InboxEntry } from '@/types'
import { useAuth } from '@/lib/auth/auth-context'
import { formatCurrency } from '@/lib/format'

const SEGMENT_LABELS: Record<string, string> = {
  champion: 'Campeão', loyal: 'Fiel', at_risk: 'Em risco', lost: 'Perdido', new: 'Novo',
}

function DisparoPageContent() {
  const [config, setConfig] = useState<OutreachConfig | null>(null)
  const [contacts, setContacts] = useState<OutreachContact[]>([])
  const [recovery, setRecovery] = useState<RecoverySummary | null>(null)
  const [churn, setChurn] = useState<ChurnRiskData | null>(null)
  const [inbox, setInbox] = useState<InboxEntry[]>([])
  const [inboxLoaded, setInboxLoaded] = useState(false)
  const { company } = useAuth()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [sending, setSending] = useState(false)

  // QR Code modal
  const [qrOpen, setQrOpen] = useState(false)
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [qrLoading, setQrLoading] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // edição de contato
  const [editContact, setEditContact] = useState<OutreachContact | null>(null)
  const [editPhone, setEditPhone] = useState('')
  const [editEmail, setEditEmail] = useState('')

  // preview/confirmação antes do disparo
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewMsg, setPreviewMsg] = useState<{ message: string | null; customerName: string | null; aiEnabled?: boolean; reason?: string } | null>(null)

  const load = useCallback(async () => {
    const reqs: Promise<unknown>[] = [
      api.outreach.getConfig(),
      api.outreach.listContacts(),
      api.outreach.getRecovery(),
    ]
    if (company?.id) reqs.push(api.insights.getChurnRisk(company.id))
    try {
      const [cfgRes, contactsRes, recoveryRes, churnRes] = await Promise.all(reqs) as [
        Awaited<ReturnType<typeof api.outreach.getConfig>>,
        Awaited<ReturnType<typeof api.outreach.listContacts>>,
        Awaited<ReturnType<typeof api.outreach.getRecovery>>,
        Awaited<ReturnType<typeof api.insights.getChurnRisk>> | undefined,
      ]
      if (cfgRes.success && cfgRes.data) setConfig(cfgRes.data)
      if (contactsRes.success && contactsRes.data) setContacts(contactsRes.data)
      if (recoveryRes.success && recoveryRes.data) setRecovery(recoveryRes.data)
      if (churnRes?.success && churnRes.data) setChurn(churnRes.data)
    } catch {
      toast.error('Não foi possível carregar a página de disparo.')
    } finally {
      setLoading(false)
    }
  }, [company?.id])

  useEffect(() => { load() }, [load])
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current) }, [])

  async function patchConfig(patch: Partial<OutreachConfig>) {
    setSaving(true)
    const res = await api.outreach.updateConfig(patch)
    if (res.success && res.data) setConfig(res.data)
    else toast.error(res.error ?? 'Erro ao salvar configuração.')
    setSaving(false)
  }

  async function handleConnect() {
    setQrOpen(true)
    setQrLoading(true)
    setQrCode(null)
    const res = await api.outreach.connectWhatsapp()
    setQrLoading(false)
    if (!res.success) {
      toast.error(res.error ?? 'Erro ao gerar QR Code. Evolution API configurada?')
      setQrOpen(false)
      return
    }
    setQrCode(res.data?.qrcode ?? null)
    // polling do status até conectar — limpa um polling anterior antes de abrir outro
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      const st = await api.outreach.whatsappStatus()
      if (st.success && st.data?.status === 'connected') {
        if (pollRef.current) clearInterval(pollRef.current)
        setQrOpen(false)
        toast.success('WhatsApp conectado!')
        load()
      }
    }, 3000)
  }

  async function handleDisconnect() {
    const res = await api.outreach.disconnectWhatsapp()
    if (res.success && res.data) {
      setConfig(res.data)
      toast.success('WhatsApp desconectado.')
    }
  }

  async function handleOpenConfirm() {
    setConfirmOpen(true)
    setPreviewLoading(true)
    setPreviewMsg(null)
    const res = await api.outreach.previewMessage()
    setPreviewLoading(false)
    if (res.success && res.data) setPreviewMsg(res.data)
    else toast.error(res.error ?? 'Erro ao gerar prévia.')
  }

  async function handleConfirmSend() {
    setSending(true)
    const res = await api.outreach.sendNow()
    setSending(false)
    setConfirmOpen(false)
    if (res.success) toast.success('Disparo iniciado em segundo plano.')
    else toast.error(res.error ?? 'Erro ao iniciar disparo.')
  }

  async function toggleOptOut(c: OutreachContact) {
    const next = !c.optOut
    setContacts(prev => prev.map(x => x.customerHash === c.customerHash ? { ...x, optOut: next } : x))
    try {
      const res = await api.outreach.updateContact(c.customerHash, { contact_opt_out: next })
      if (!res.success) throw new Error(res.error ?? '')
    } catch {
      // reverte o otimismo se o servidor recusar — a UI não pode mentir sobre o opt-out
      setContacts(prev => prev.map(x => x.customerHash === c.customerHash ? { ...x, optOut: c.optOut } : x))
      toast.error('Não foi possível atualizar o contato.')
    }
  }

  async function loadInbox() {
    if (inboxLoaded) return
    const res = await api.outreach.getInbox()
    if (res.success && res.data) setInbox(res.data)
    setInboxLoaded(true)
  }

  function openEdit(c: OutreachContact) {
    setEditContact(c)
    setEditPhone(c.phone ?? '')
    setEditEmail(c.email ?? '')
  }

  async function saveContact() {
    if (!editContact) return
    const res = await api.outreach.updateContact(editContact.customerHash, {
      phone: editPhone || null, email: editEmail || null,
    })
    if (res.success) {
      toast.success('Contato atualizado.')
      setEditContact(null)
      load()
    } else {
      toast.error(res.error ?? 'Erro ao salvar contato.')
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col min-h-screen">
        <DashboardHeader title="Disparo automático" description="Envio automático para clientes inativos" />
        <div className="flex-1 p-6 lg:p-8 space-y-6">
          <div className="h-24 rounded-2xl bg-muted animate-pulse" />
          <div className="h-28 rounded-2xl bg-muted animate-pulse" />
          <div className="h-12 rounded-2xl bg-muted animate-pulse" />
          <div className="h-72 rounded-2xl bg-muted animate-pulse" />
        </div>
      </div>
    )
  }

  const connected = config?.whatsappStatus === 'connected'
  const targetCount = contacts.filter(c => !c.optOut && ['at_risk', 'lost'].includes(c.segment) && (c.phone || c.email)).length

  return (
    <div className="flex flex-col min-h-screen">
      <DashboardHeader
        title="Disparo automático"
        description="Reative clientes inativos por WhatsApp e e-mail, com mensagens geradas por IA"
      />
      <div className="flex-1 p-6 lg:p-8 space-y-6">

        {/* Receita recuperada — loop fechado */}
        <Card className="rounded-2xl border border-success/30 bg-success/[0.06] shadow-sm">
          <CardContent className="flex flex-wrap items-center justify-between gap-4 py-5">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-success/15">
                <TrendingUp className="h-5 w-5 text-success" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Receita recuperada via disparo</p>
                <p className="font-[family-name:var(--font-display)] text-3xl font-extrabold leading-tight tracking-[-0.02em] text-success tabular-nums">
                  {formatCurrency(recovery?.totalRecovered ?? 0)}
                </p>
              </div>
            </div>
            <div className="text-right text-sm text-muted-foreground">
              <p><strong className="font-semibold text-foreground tabular-nums">{recovery?.recoveredCount ?? 0}</strong> clientes reativados</p>
              <p className="tabular-nums">{recovery?.pendingCount ?? 0} aguardando retorno</p>
              <p className="tabular-nums">{recovery?.repliesCount ?? 0} respostas recebidas</p>
            </div>
          </CardContent>
        </Card>

        {/* Churn preditivo — clientes prestes a sumir */}
        {churn && churn.total > 0 && (
          <Card className="rounded-2xl border border-warning/30 bg-warning/[0.06] shadow-sm">
            <CardContent className="flex flex-wrap items-center justify-between gap-4 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-warning/15 shrink-0">
                  <AlertTriangle className="h-5 w-5 text-warning" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground tabular-nums">
                    {churn.total} cliente(s) prestes a sumir
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Ainda ativos, mas atrasados na própria cadência de compra — aja antes de perdê-los.
                  </p>
                </div>
              </div>
              <div className="flex gap-2 text-xs">
                {churn.counts.high > 0 && (
                  <Badge className="rounded-full border-0 bg-destructive/10 text-destructive tabular-nums">{churn.counts.high} alto</Badge>
                )}
                {churn.counts.medium > 0 && (
                  <Badge className="rounded-full border-0 bg-warning/10 text-warning tabular-nums">{churn.counts.medium} médio</Badge>
                )}
                {churn.counts.low > 0 && (
                  <Badge className="rounded-full border-0 bg-muted text-muted-foreground tabular-nums">{churn.counts.low} baixo</Badge>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Disparo de hoje — ação primária */}
        <Card className="rounded-2xl border border-primary/20 bg-primary/[0.03] shadow-sm">
          <CardContent className="flex flex-wrap items-center justify-between gap-4 py-5">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Disparo de hoje</p>
              <p className="mt-1 font-[family-name:var(--font-display)] text-3xl font-extrabold leading-none tracking-[-0.02em] text-primary tabular-nums">{targetCount}</p>
              <p className="mt-1.5 text-sm text-muted-foreground">
                clientes elegíveis (em risco/perdidos, com contato, sem opt-out) ·{' '}
                {connected
                  ? <span className="inline-flex items-center gap-1 font-medium text-success"><CheckCircle2 className="h-3.5 w-3.5" /> WhatsApp conectado</span>
                  : <span className="inline-flex items-center gap-1 font-medium text-warning"><AlertTriangle className="h-3.5 w-3.5" /> WhatsApp desconectado</span>}
              </p>
            </div>
            <Button size="lg" onClick={handleOpenConfirm} disabled={sending || targetCount === 0}>
              <Send className="h-4 w-4 mr-2" /> Revisar e enviar
            </Button>
          </CardContent>
        </Card>

        {/* Configuração — secundária, recolhível (aberta se ainda não conectou) */}
        <Collapsible defaultOpen={!connected} className="space-y-6">
          <CollapsibleTrigger className="group flex w-full items-center justify-between rounded-2xl border border-border bg-card px-4 py-3 text-sm font-medium shadow-sm transition-all hover:shadow-md">
            <span className="flex items-center gap-2"><Settings2 className="h-4 w-4 text-muted-foreground" /> Configuração de disparo</span>
            <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-6">

        {/* Conexão WhatsApp */}
        <Card className="rounded-2xl border border-border bg-card shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-[family-name:var(--font-display)] text-lg font-bold tracking-[-0.02em]">
              <Smartphone className="h-5 w-5 text-primary" /> WhatsApp do vendedor
            </CardTitle>
            <CardDescription>
              Conecte o número do vendedor (o cliente já conhece). As mensagens saem desse número.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {connected ? (
                <>
                  <CheckCircle2 className="h-5 w-5 text-success" />
                  <span className="text-sm">Conectado{config?.whatsappNumber ? ` — ${config.whatsappNumber}` : ''}</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="h-5 w-5 text-warning" />
                  <span className="text-sm text-muted-foreground">Desconectado</span>
                </>
              )}
            </div>
            {connected ? (
              <Button variant="outline" onClick={handleDisconnect}>Desconectar</Button>
            ) : (
              <Button onClick={handleConnect} disabled={!config?.evolutionConfigured}>
                <MessageCircle className="h-4 w-4 mr-2" /> Conectar via QR Code
              </Button>
            )}
          </CardContent>
          {!config?.evolutionConfigured && (
            <CardContent className="pt-0">
              <p className="text-xs text-warning">
                Evolution API não configurada no servidor (EVOLUTION_API_URL / EVOLUTION_API_KEY).
              </p>
            </CardContent>
          )}
        </Card>

        {/* Configuração de canais */}
        <Card className="rounded-2xl border border-border bg-card shadow-sm">
          <CardHeader>
            <CardTitle className="font-[family-name:var(--font-display)] text-lg font-bold tracking-[-0.02em]">Canais e regras</CardTitle>
            <CardDescription>Defina como e quando os disparos acontecem.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageCircle className="h-4 w-4" />
                <Label>WhatsApp</Label>
              </div>
              <Switch checked={config?.whatsappEnabled ?? false}
                onCheckedChange={v => patchConfig({ whatsappEnabled: v })} disabled={saving} />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4" />
                <Label>E-mail</Label>
              </div>
              <Switch checked={config?.emailEnabled ?? false}
                onCheckedChange={v => patchConfig({ emailEnabled: v })} disabled={saving} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div className="space-y-2">
                <Label>Nome na assinatura (e-mail / WhatsApp)</Label>
                <Input defaultValue={config?.senderName ?? ''}
                  onBlur={e => patchConfig({ senderName: e.target.value })}
                  placeholder="Ex: João — Vendas Atacado Central" />
              </div>
              <div className="space-y-2">
                <Label>Horário de envio (BRT)</Label>
                <Input type="number" min={0} max={23} defaultValue={config?.sendHour ?? 9}
                  onBlur={e => patchConfig({ sendHour: parseInt(e.target.value) || 9 })} />
              </div>
              <div className="space-y-2">
                <Label>Limite de mensagens/dia</Label>
                <Input type="number" min={1} defaultValue={config?.dailyLimit ?? 30}
                  onBlur={e => patchConfig({ dailyLimit: parseInt(e.target.value) || 30 })} />
              </div>
              <div className="space-y-2">
                <Label>Valor mínimo da oportunidade (R$)</Label>
                <Input type="number" min={0} defaultValue={config?.minOpportunityValue ?? 0}
                  onBlur={e => patchConfig({ minOpportunityValue: parseFloat(e.target.value) || 0 })} />
              </div>
            </div>

            <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-muted/30 p-4">
              <div>
                <Label className="text-base">Disparo automático diário</Label>
                <p className="text-sm text-muted-foreground">
                  Envia todo dia no horário definido para clientes em risco/perdidos (respeita opt-out).
                </p>
              </div>
              <Switch checked={config?.autoSendEnabled ?? false}
                onCheckedChange={v => patchConfig({ autoSendEnabled: v })} disabled={saving} />
            </div>

            <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-muted/30 p-4">
              <div>
                <Label className="text-base">Cadência multi-toque</Label>
                <p className="text-sm text-muted-foreground">
                  Em vez de 1 mensagem, uma sequência: dia 0 WhatsApp → dia 3 e-mail → dia 7 follow-up.
                  Para sozinha se o cliente responder, comprar ou descadastrar.
                </p>
              </div>
              <Switch checked={config?.cadenceEnabled ?? false}
                onCheckedChange={v => patchConfig({ cadenceEnabled: v })} disabled={saving} />
            </div>

          </CardContent>
        </Card>
          </CollapsibleContent>
        </Collapsible>

        {/* Tabs: Contatos + Respostas */}
        <Tabs defaultValue="contacts" onValueChange={(v) => { if (v === 'inbox') loadInbox() }}>
          <TabsList>
            <TabsTrigger value="contacts">
              <Smartphone className="h-4 w-4 mr-2" />
              Contatos
            </TabsTrigger>
            <TabsTrigger value="inbox">
              <Inbox className="h-4 w-4 mr-2" />
              Respostas
              {(recovery?.repliesCount ?? 0) > 0 && (
                <span className="ml-1.5 rounded-full bg-primary/15 px-1.5 text-[10px] font-semibold tabular-nums text-primary">
                  {recovery?.repliesCount}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="contacts" className="mt-4">
            <Card className="rounded-2xl border border-border bg-card shadow-sm">
              <CardHeader>
                <CardTitle className="font-[family-name:var(--font-display)] text-lg font-bold tracking-[-0.02em]">Contatos dos clientes</CardTitle>
                <CardDescription>
                  Complete telefone/e-mail faltantes e exclua quem não deve receber (opt-out).
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Segmento</TableHead>
                      <TableHead>Telefone</TableHead>
                      <TableHead>E-mail</TableHead>
                      <TableHead className="text-right">Receita</TableHead>
                      <TableHead className="text-center">Receber</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {contacts.map(c => (
                      <TableRow key={c.customerHash} className={c.optOut ? 'opacity-50' : ''}>
                        <TableCell className="font-medium">{c.customerName}</TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              c.segment === 'lost' ? 'rounded-full border-0 bg-destructive/10 text-destructive'
                              : c.segment === 'at_risk' ? 'rounded-full border-0 bg-warning/10 text-warning'
                              : c.segment === 'champion' || c.segment === 'loyal' ? 'rounded-full border-0 bg-success/10 text-success'
                              : 'rounded-full border-0 bg-muted text-muted-foreground'
                            }
                          >
                            {SEGMENT_LABELS[c.segment] ?? c.segment}
                          </Badge>
                        </TableCell>
                        <TableCell className={c.phone ? 'tabular-nums' : 'text-muted-foreground'}>{c.phone ?? '—'}</TableCell>
                        <TableCell className={c.email ? '' : 'text-muted-foreground'}>{c.email ?? '—'}</TableCell>
                        <TableCell className="text-right font-medium tabular-nums">{formatCurrency(c.totalRevenue)}</TableCell>
                        <TableCell className="text-center">
                          <Switch checked={!c.optOut} onCheckedChange={() => toggleOptOut(c)} />
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" onClick={() => openEdit(c)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {contacts.length === 0 && (
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={7} className="py-12">
                          <div className="flex flex-col items-center justify-center text-center">
                            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent text-primary">
                              <Smartphone className="h-7 w-7" />
                            </div>
                            <p className="mt-4 font-[family-name:var(--font-display)] text-base font-bold tracking-[-0.02em] text-foreground">Nenhum cliente ainda</p>
                            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                              Faça upload de uma planilha com vendas para popular os contatos e começar a disparar.
                            </p>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="inbox" className="mt-4">
            <Card className="rounded-2xl border border-border bg-card shadow-sm">
              <CardHeader>
                <CardTitle className="font-[family-name:var(--font-display)] text-lg font-bold tracking-[-0.02em]">Respostas recebidas</CardTitle>
                <CardDescription>
                  Mensagens recebidas via WhatsApp dos clientes contatados. Conteúdo não armazenado (LGPD).
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Telefone</TableHead>
                      <TableHead>Segmento</TableHead>
                      <TableHead>Recebido em</TableHead>
                      <TableHead className="text-center">Opt-out</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {inbox.map(entry => (
                      <TableRow key={entry.id}>
                        <TableCell className="font-medium">{entry.customerName ?? '—'}</TableCell>
                        <TableCell className="tabular-nums text-sm">{entry.phone ?? '—'}</TableCell>
                        <TableCell>
                          {entry.segment ? (
                            <Badge variant="outline" className="rounded-full border-0 bg-muted text-muted-foreground text-xs">
                              {SEGMENT_LABELS[entry.segment] ?? entry.segment}
                            </Badge>
                          ) : '—'}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground tabular-nums">
                          {entry.receivedAt ? new Date(entry.receivedAt).toLocaleString('pt-BR') : '—'}
                        </TableCell>
                        <TableCell className="text-center">
                          {entry.optOut ? (
                            <Badge className="rounded-full border-0 bg-destructive/10 text-destructive text-xs">Descadastrado</Badge>
                          ) : (
                            <Badge className="rounded-full border-0 bg-success/10 text-success text-xs">Ativo</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    {inboxLoaded && inbox.length === 0 && (
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={5} className="py-12">
                          <div className="flex flex-col items-center justify-center text-center">
                            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent text-primary">
                              <Inbox className="h-7 w-7" />
                            </div>
                            <p className="mt-4 font-[family-name:var(--font-display)] text-base font-bold tracking-[-0.02em] text-foreground">Nenhuma resposta ainda</p>
                            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                              As respostas dos clientes via WhatsApp aparecerão aqui após o disparo.
                            </p>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* QR Code modal */}
      <Dialog open={qrOpen} onOpenChange={(o) => { setQrOpen(o); if (!o && pollRef.current) clearInterval(pollRef.current) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-[family-name:var(--font-display)] font-bold tracking-[-0.02em]">Conectar WhatsApp</DialogTitle>
            <DialogDescription>
              Abra o WhatsApp no celular → Aparelhos conectados → Conectar aparelho → escaneie o código.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-center p-4 min-h-[260px]">
            {qrLoading && <Spinner />}
            {!qrLoading && qrCode && (
              <img
                src={qrCode.startsWith('data:') ? qrCode : `data:image/png;base64,${qrCode}`}
                alt="QR Code WhatsApp" className="w-60 h-60"
              />
            )}
            {!qrLoading && !qrCode && (
              <p className="text-sm text-muted-foreground">QR Code indisponível. Tente novamente.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmação + preview da mensagem */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-[family-name:var(--font-display)] font-bold tracking-[-0.02em]">Revisar antes de enviar</DialogTitle>
            <DialogDescription>
              Esta é a mensagem que será enviada para <strong>{targetCount}</strong> cliente(s) elegível(is).
              Exemplo gerado para um cliente real:
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 min-h-[120px]">
            {previewLoading && <div className="flex justify-center py-6"><Spinner /></div>}
            {!previewLoading && previewMsg?.message && (
              <>
                <div className="rounded-xl border border-border bg-muted/40 p-4 text-sm whitespace-pre-wrap">
                  {previewMsg.message}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Prévia para: <strong>{previewMsg.customerName}</strong>.{' '}
                  {previewMsg.aiEnabled
                    ? 'Cada cliente recebe uma mensagem única gerada por IA.'
                    : 'IA não configurada — usando mensagem padrão personalizada com os dados de cada cliente.'}
                </p>
              </>
            )}
            {!previewLoading && !previewMsg?.message && (
              <p className="text-sm text-warning py-4">
                {previewMsg?.reason ?? 'Nenhum cliente elegível para envio agora.'}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancelar</Button>
            <Button onClick={handleConfirmSend} disabled={sending || previewLoading || !previewMsg?.message}>
              {sending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
              Confirmar e enviar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Editar contato */}
      <Dialog open={!!editContact} onOpenChange={o => !o && setEditContact(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-[family-name:var(--font-display)] font-bold tracking-[-0.02em]">Editar contato — {editContact?.customerName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Telefone (WhatsApp)</Label>
              <Input value={editPhone} onChange={e => setEditPhone(e.target.value)}
                placeholder="(11) 98238-7185" />
            </div>
            <div className="space-y-2">
              <Label>E-mail</Label>
              <Input value={editEmail} onChange={e => setEditEmail(e.target.value)}
                placeholder="cliente@email.com" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditContact(null)}>Cancelar</Button>
            <Button onClick={saveContact}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default function DisparoPage() {
  return (
    <ProtectedRoute requiredRoles={['admin', 'analyst']}>
      <DisparoPageContent />
    </ProtectedRoute>
  )
}
