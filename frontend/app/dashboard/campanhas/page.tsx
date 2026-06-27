'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth/auth-context'
import { api } from '@/lib/api/client'
import type { Campaign, MessageTemplate } from '@/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Megaphone, Plus, Send, Trash2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

const STATUS_LABELS: Record<Campaign['status'], string> = {
  draft: 'Rascunho',
  sending: 'Enviando…',
  sent: 'Enviada',
  failed: 'Falhou',
}

const STATUS_VARIANT: Record<Campaign['status'], 'default' | 'secondary' | 'destructive' | 'outline'> = {
  draft: 'secondary',
  sending: 'default',
  sent: 'outline',
  failed: 'destructive',
}

const SEGMENT_LABELS: Record<string, string> = {
  at_risk: 'Em risco',
  lost: 'Perdidos',
  all: 'Todos elegíveis',
}

export default function CampanhasPage() {
  const { user, company } = useAuth()
  const isAdmin = user?.role === 'admin'
  const isAnalyst = user?.role === 'admin' || user?.role === 'analyst'

  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [templates, setTemplates] = useState<MessageTemplate[]>([])
  const [loading, setLoading] = useState(true)

  const [createOpen, setCreateOpen] = useState(false)
  const [sending, setSending] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  const [form, setForm] = useState({
    name: '',
    segment: '' as string,
    branch: '',
    salesperson: '',
    messageContent: '',
    selectedTemplateId: '',
  })

  async function load() {
    if (!company) return
    setLoading(true)
    try {
      const [c, t] = await Promise.all([
        api.campaigns.list(company.id),
        api.templates.list(),
      ])
      if (c.success && c.data) setCampaigns(c.data)
      if (t.success && t.data) setTemplates(t.data)
    } catch {
      toast.error('Não foi possível carregar as campanhas.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [company?.id])

  function handleTemplateSelect(templateId: string) {
    const tpl = templates.find(t => t.id === templateId)
    setForm(f => ({
      ...f,
      selectedTemplateId: templateId,
      messageContent: tpl ? tpl.content : f.messageContent,
      segment: tpl ? tpl.segment : f.segment,
    }))
  }

  async function handleCreate() {
    if (!company || !form.name.trim() || !form.messageContent.trim()) return
    const res = await api.campaigns.create(company.id, {
      name: form.name,
      segment: form.segment || null,
      branch: form.branch || null,
      salesperson: form.salesperson || null,
      messageContent: form.messageContent,
    })
    if (res.success) {
      setCreateOpen(false)
      setForm({ name: '', segment: '', branch: '', salesperson: '', messageContent: '', selectedTemplateId: '' })
      toast.success('Campanha criada.')
      load()
    } else {
      toast.error(res.error ?? 'Não foi possível criar a campanha.')
    }
  }

  async function handleSend(campaignId: string) {
    if (!company) return
    setSending(campaignId)
    const res = await api.campaigns.send(company.id, campaignId)
    setSending(null)
    if (res.success) toast.success('Campanha enviada.')
    else toast.error(res.error ?? 'Não foi possível enviar a campanha.')
    load()
  }

  async function handleDelete(campaignId: string) {
    if (!company || !isAdmin) return
    setDeleting(campaignId)
    const res = await api.campaigns.remove(company.id, campaignId)
    setDeleting(null)
    if (res.success) toast.success('Campanha excluída.')
    else toast.error(res.error ?? 'Não foi possível excluir a campanha.')
    load()
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Megaphone className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-semibold font-display">Campanhas</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Atualizar
          </Button>
          {isAnalyst && (
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Nova campanha
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Carregando…</div>
      ) : campaigns.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Megaphone className="h-8 w-8 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Nenhuma campanha criada ainda.</p>
            {isAnalyst && (
              <Button className="mt-4" size="sm" onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4 mr-1" />
                Criar campanha
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {campaigns.map(c => (
            <Card key={c.id}>
              <CardContent className="py-4 flex items-center justify-between gap-4">
                <div className="space-y-1 flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">{c.name}</span>
                    <Badge variant={STATUS_VARIANT[c.status]}>{STATUS_LABELS[c.status]}</Badge>
                    {c.segment && (
                      <Badge variant="outline" className="text-xs">{SEGMENT_LABELS[c.segment] ?? c.segment}</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-1">{c.messageContent}</p>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    {c.sentAt ? (
                      <>
                        <span>Enviada: {new Date(c.sentAt).toLocaleDateString('pt-BR')}</span>
                        <span>{c.sentCount} / {c.targetCount} enviados</span>
                      </>
                    ) : (
                      <span>Criada: {new Date(c.createdAt).toLocaleDateString('pt-BR')}</span>
                    )}
                    {c.branch && <span>Filial: {c.branch}</span>}
                    {c.salesperson && <span>Vendedor: {c.salesperson}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {isAnalyst && c.status === 'draft' && (
                    <Button
                      size="sm"
                      onClick={() => handleSend(c.id)}
                      disabled={sending === c.id}
                    >
                      <Send className="h-4 w-4 mr-1" />
                      {sending === c.id ? 'Enfileirando…' : 'Disparar'}
                    </Button>
                  )}
                  {isAdmin && c.status !== 'sending' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(c.id)}
                      disabled={deleting === c.id}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nova campanha</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1">
              <Label>Nome da campanha</Label>
              <Input
                placeholder="Ex: Recuperação Q3 2026"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>
            {templates.filter(t => t.isActive).length > 0 && (
              <div className="space-y-1">
                <Label>Usar template (opcional)</Label>
                <Select value={form.selectedTemplateId} onValueChange={handleTemplateSelect}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um template" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.filter(t => t.isActive).map(t => (
                      <SelectItem key={t.id} value={t.id}>{t.name} ({SEGMENT_LABELS[t.segment] ?? t.segment})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Segmento</Label>
                <Select value={form.segment} onValueChange={v => setForm(f => ({ ...f, segment: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todos elegíveis" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos elegíveis</SelectItem>
                    <SelectItem value="at_risk">Em risco</SelectItem>
                    <SelectItem value="lost">Perdidos</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Filial (opcional)</Label>
                <Input
                  placeholder="Ex: SP-001"
                  value={form.branch}
                  onChange={e => setForm(f => ({ ...f, branch: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Vendedor (opcional)</Label>
              <Input
                placeholder="Nome do vendedor"
                value={form.salesperson}
                onChange={e => setForm(f => ({ ...f, salesperson: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Mensagem</Label>
              <Textarea
                rows={5}
                placeholder="Use {customer_name} e {sender_name} como variáveis."
                value={form.messageContent}
                onChange={e => setForm(f => ({ ...f, messageContent: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">Variáveis disponíveis: {'{customer_name}'}, {'{sender_name}'}</p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
              <Button onClick={handleCreate} disabled={!form.name.trim() || !form.messageContent.trim()}>
                Criar rascunho
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
