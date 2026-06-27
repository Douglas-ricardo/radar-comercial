'use client'

import { useState, useEffect, useCallback } from 'react'
import { DashboardHeader } from '@/components/dashboard/header'
import { ProtectedRoute } from '@/lib/auth/protected-route'
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { Switch } from '@/components/ui/switch'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Field, FieldLabel } from '@/components/ui/field'
import { Plug2, Plus, Copy, Trash2, Key, Clock, CheckCircle2, RefreshCw, Webhook, Send } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { api, webhooksApi } from '@/lib/api/client'
import { toast } from 'sonner'
import type { ApiKey, NewApiKey, SyncConfig, WebhookConfig, WebhookDelivery } from '@/types'
import { CrmSection } from '@/components/integrations/crm-section'

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso))
}

function IntegrationsPageContent() {
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isCreating, setIsCreating] = useState(false)
  const [newKeyName, setNewKeyName] = useState('')
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [createdKey, setCreatedKey] = useState<NewApiKey | null>(null)
  const [revokeTarget, setRevokeTarget] = useState<ApiKey | null>(null)
  const [copied, setCopied] = useState(false)

  // Webhooks state
  const [webhooks, setWebhooks] = useState<WebhookConfig[]>([])
  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([])
  const [showWebhookDialog, setShowWebhookDialog] = useState(false)
  const [showDeliveriesDialog, setShowDeliveriesDialog] = useState(false)
  const [webhookUrl, setWebhookUrl] = useState('')
  const [webhookEvents, setWebhookEvents] = useState<string[]>(['opportunity.updated'])
  const [isCreatingWebhook, setIsCreatingWebhook] = useState(false)

  // Google Sheets sync state
  const [syncConfig, setSyncConfig] = useState<SyncConfig | null>(null)
  const [syncLoading, setSyncLoading] = useState(true)
  const [sheetUrl, setSheetUrl] = useState('')
  const [sheetName, setSheetName] = useState('')
  const [syncEnabled, setSyncEnabled] = useState(true)
  const [isSavingSync, setIsSavingSync] = useState(false)
  const [isTriggeringSync, setIsTriggeringSync] = useState(false)

  const loadKeys = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await api.integrations.listKeys()
      if (res.success && res.data) setKeys(res.data)
    } catch {
      toast.error('Não foi possível carregar as chaves de API.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  const loadSyncConfig = useCallback(async () => {
    setSyncLoading(true)
    try {
      const res = await api.integrations.getSyncStatus()
      if (res.success && res.data) {
        setSyncConfig(res.data)
        setSheetUrl(res.data.sheetUrl ?? '')
        setSheetName(res.data.sheetName ?? '')
        setSyncEnabled(res.data.enabled)
      }
    } catch {
      toast.error('Não foi possível carregar a configuração de sincronização.')
    } finally {
      setSyncLoading(false)
    }
  }, [])

  const loadWebhooks = useCallback(async () => {
    const res = await webhooksApi.list()
    if (res.success && res.data) setWebhooks(res.data)
  }, [])

  useEffect(() => {
    loadKeys()
    loadSyncConfig()
    loadWebhooks()
  }, [loadKeys, loadSyncConfig, loadWebhooks])

  const handleCreateWebhook = async () => {
    if (!webhookUrl.trim()) { toast.error('Informe a URL do webhook.'); return }
    setIsCreatingWebhook(true)
    try {
      const res = await webhooksApi.create({ targetUrl: webhookUrl.trim(), events: webhookEvents })
      if (res.success && res.data) {
        toast.success(`Webhook criado. Secret: ${res.data.secret}`)
        setShowWebhookDialog(false)
        setWebhookUrl('')
        loadWebhooks()
      } else {
        toast.error(res.error ?? 'Erro ao criar webhook.')
      }
    } catch { toast.error('Erro de conexão.') }
    finally { setIsCreatingWebhook(false) }
  }

  const handleDeleteWebhook = async (id: string) => {
    const res = await webhooksApi.remove(id)
    if (res.success) { toast.success('Webhook removido.'); loadWebhooks() }
    else toast.error(res.error ?? 'Erro ao remover.')
  }

  const handleTestWebhook = async (id: string) => {
    const res = await webhooksApi.test(id)
    if (res.success) toast.success('Payload de teste enviado.')
    else toast.error(res.error ?? 'Erro ao testar.')
  }

  const handleShowDeliveries = async () => {
    const res = await webhooksApi.listDeliveries()
    if (res.success && res.data) setDeliveries(res.data)
    setShowDeliveriesDialog(true)
  }

  const handleSaveSync = async () => {
    if (!sheetUrl.trim()) {
      toast.error('Informe a URL da planilha.')
      return
    }
    setIsSavingSync(true)
    try {
      const res = await api.integrations.saveSyncConfig({
        sheetUrl: sheetUrl.trim(),
        sheetName: sheetName.trim() || undefined,
        enabled: syncEnabled,
      })
      if (res.success) {
        toast.success('Configuração salva.')
        loadSyncConfig()
      } else {
        toast.error(res.error ?? 'Erro ao salvar configuração.')
      }
    } catch {
      toast.error('Erro de conexão.')
    } finally {
      setIsSavingSync(false)
    }
  }

  const handleTriggerSync = async () => {
    setIsTriggeringSync(true)
    try {
      const res = await api.integrations.triggerSync()
      if (res.success) {
        toast.success('Sincronização iniciada. Aguarde alguns instantes.')
      } else {
        toast.error(res.error ?? 'Erro ao iniciar sincronização.')
      }
    } catch {
      toast.error('Erro de conexão.')
    } finally {
      setIsTriggeringSync(false)
    }
  }

  const handleCreate = async () => {
    if (!newKeyName.trim()) return
    setIsCreating(true)
    try {
      const res = await api.integrations.createKey(newKeyName.trim())
      if (res.success && res.data) {
        setCreatedKey(res.data)
        setShowCreateDialog(false)
        setNewKeyName('')
        loadKeys()
      } else {
        toast.error(res.error ?? 'Erro ao criar chave.')
      }
    } catch {
      toast.error('Erro de conexão.')
    } finally {
      setIsCreating(false)
    }
  }

  const handleRevoke = async () => {
    if (!revokeTarget) return
    const res = await api.integrations.revokeKey(revokeTarget.id)
    if (res.success) {
      toast.success('Chave revogada.')
      setKeys((prev) => prev.filter((k) => k.id !== revokeTarget.id))
    } else {
      toast.error(res.error ?? 'Erro ao revogar.')
    }
    setRevokeTarget(null)
  }

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex flex-col">
      <DashboardHeader
        title="Integrações"
        description="Gerencie API Keys para ingestão automática de dados via ERP ou n8n"
      />
      <div className="flex-1 p-6 lg:p-8 space-y-6 max-w-[1200px] mx-auto w-full">

        {/* CRM bidirecional */}
        <CrmSection />

        {/* API Keys */}
        <Card className="rounded-2xl border-border shadow-sm">
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div className="space-y-1.5">
              <CardTitle className="flex items-center gap-2 font-[family-name:var(--font-display)] text-lg font-bold tracking-[-0.02em]">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-primary">
                  <Key className="h-4 w-4" />
                </span>
                API Keys
              </CardTitle>
              <CardDescription>
                Use estas chaves no header <code className="bg-muted px-1 rounded text-xs font-mono">X-API-Key</code> para ingerir dados via <code className="bg-muted px-1 rounded text-xs font-mono">POST /api/data/ingest</code>
              </CardDescription>
            </div>
            <Button onClick={() => setShowCreateDialog(true)} size="sm" className="shrink-0">
              <Plus className="h-4 w-4 mr-2" />
              Nova chave
            </Button>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Spinner className="h-6 w-6" />
              </div>
            ) : keys.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent mb-4">
                  <Plug2 className="h-7 w-7 text-primary" />
                </div>
                <p className="font-medium text-foreground">Nenhuma chave criada ainda</p>
                <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                  Crie uma chave para integrar seu ERP ou n8n e enviar dados automaticamente.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {keys.map((key) => (
                  <div
                    key={key.id}
                    className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card px-4 py-3 transition-all hover:shadow-md hover:border-primary/30"
                  >
                    <div className="min-w-0 space-y-1">
                      <p className="font-medium text-sm text-foreground truncate">{key.name}</p>
                      <p className="text-xs text-muted-foreground font-mono truncate">
                        {key.prefix}••••••••••••••••••••
                      </p>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5">
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Criada {formatDate(key.createdAt)}
                        </span>
                        {key.lastUsedAt && (
                          <span className="text-xs text-muted-foreground">
                            · Último uso {formatDate(key.lastUsedAt)}
                          </span>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10 h-8 w-8"
                      onClick={() => setRevokeTarget(key)}
                      aria-label={`Revogar chave ${key.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Google Sheets Sync */}
        <Card className="rounded-2xl border-border shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-[family-name:var(--font-display)] text-lg font-bold tracking-[-0.02em]">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-primary">
                <RefreshCw className="h-4 w-4" />
              </span>
              Sincronização Google Sheets
            </CardTitle>
            <CardDescription>
              Conecte uma planilha Google Sheets para importar dados de vendas automaticamente a cada 6 horas.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {syncLoading ? (
              <div className="flex items-center justify-center py-8">
                <Spinner className="h-6 w-6" />
              </div>
            ) : (
              <div className="space-y-4">
                {syncConfig?.lastSyncAt && (
                  <div className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${
                    syncConfig.lastSyncStatus === 'error'
                      ? 'border-destructive/40 bg-destructive/5 text-destructive'
                      : 'border-border bg-muted/40 text-muted-foreground'
                  }`}>
                    {syncConfig.lastSyncStatus === 'ok' ? (
                      <CheckCircle2 className="h-4 w-4 mt-0.5 text-success shrink-0" />
                    ) : (
                      <RefreshCw className="h-4 w-4 mt-0.5 shrink-0" />
                    )}
                    <div>
                      <span className="font-medium">
                        {syncConfig.lastSyncStatus === 'ok' ? 'Última sincronização: ' : 'Erro na última sincronização: '}
                      </span>
                      {syncConfig.lastSyncStatus === 'ok'
                        ? formatDate(syncConfig.lastSyncAt)
                        : syncConfig.lastSyncError ?? 'Erro desconhecido'}
                    </div>
                  </div>
                )}

                <Field>
                  <FieldLabel htmlFor="sheet-url">URL da planilha *</FieldLabel>
                  <Input
                    id="sheet-url"
                    placeholder="https://docs.google.com/spreadsheets/d/..."
                    value={sheetUrl}
                    onChange={(e) => setSheetUrl(e.target.value)}
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="sheet-name">Nome da aba (opcional)</FieldLabel>
                  <Input
                    id="sheet-name"
                    placeholder="Deixe em branco para usar a primeira aba"
                    value={sheetName}
                    onChange={(e) => setSheetName(e.target.value)}
                  />
                </Field>

                <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-muted/20 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">Sincronização automática</p>
                    <p className="text-xs text-muted-foreground">Atualiza a cada 6 horas automaticamente</p>
                  </div>
                  <Switch
                    checked={syncEnabled}
                    onCheckedChange={setSyncEnabled}
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <Button onClick={handleSaveSync} disabled={isSavingSync}>
                    {isSavingSync && <Spinner className="mr-2 h-4 w-4" />}
                    Salvar configuração
                  </Button>
                  {syncConfig && (
                    <Button
                      variant="outline"
                      onClick={handleTriggerSync}
                      disabled={isTriggeringSync || !syncEnabled}
                    >
                      {isTriggeringSync ? (
                        <Spinner className="mr-2 h-4 w-4" />
                      ) : (
                        <RefreshCw className="mr-2 h-4 w-4" />
                      )}
                      Sincronizar agora
                    </Button>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Docs */}
        <Card className="rounded-2xl border-border shadow-sm">
          <CardHeader>
            <CardTitle className="font-[family-name:var(--font-display)] text-base font-bold tracking-[-0.02em]">Como usar</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <p>Envie dados de vendas programaticamente com uma requisição POST:</p>
            <pre className="bg-muted border border-border rounded-xl p-4 text-xs overflow-auto font-mono text-foreground">
{`POST /api/data/ingest
X-API-Key: rc_live_sua_chave_aqui
Content-Type: application/json

{
  "records": [
    {
      "data": "2024-01-15",
      "cliente": "Empresa ABC",
      "produto": "Produto X",
      "quantidade": 2,
      "valor": 1500.00
    }
  ]
}`}
            </pre>
            <p className="text-xs">
              Os dados são processados pelo mesmo pipeline do upload manual. Use a rota{' '}
              <code className="bg-muted px-1 rounded">GET /api/files/{'{file_id}'}/status</code>{' '}
              para acompanhar o processamento.
            </p>
            <div className="flex flex-wrap gap-2 pt-2">
              <Badge variant="secondary" className="rounded-full">n8n</Badge>
              <Badge variant="secondary" className="rounded-full">Omie</Badge>
              <Badge variant="secondary" className="rounded-full">Bling</Badge>
              <Badge variant="secondary" className="rounded-full">Conta Azul</Badge>
              <Badge variant="secondary" className="rounded-full">Google Sheets</Badge>
              <Badge variant="secondary" className="rounded-full">Zapier</Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Dialog: criar nova chave */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Criar nova API Key</DialogTitle>
            <DialogDescription>
              Dê um nome descritivo para identificar esta integração.
            </DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="key-name">Nome da chave</FieldLabel>
            <Input
              id="key-name"
              placeholder="Ex: n8n — Omie Produção"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              autoFocus
            />
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={isCreating || !newKeyName.trim()}>
              {isCreating && <Spinner className="mr-2 h-4 w-4" />}
              Criar chave
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: exibir chave criada (only once) */}
      <Dialog open={!!createdKey} onOpenChange={() => setCreatedKey(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-success" />
              Chave criada com sucesso
            </DialogTitle>
            <DialogDescription>
              Copie e guarde agora — esta chave não será exibida novamente.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-xl border border-primary/30 bg-accent/40 p-3.5 font-mono text-sm break-all text-foreground">
            {createdKey?.key}
          </div>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => handleCopy(createdKey?.key ?? '')}
          >
            {copied ? (
              <CheckCircle2 className="mr-2 h-4 w-4 text-success" />
            ) : (
              <Copy className="mr-2 h-4 w-4" />
            )}
            {copied ? 'Copiado!' : 'Copiar chave'}
          </Button>
          <DialogFooter>
            <Button onClick={() => setCreatedKey(null)}>Entendido</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Card: Webhooks de Saída */}
      <Card className="rounded-2xl border border-border bg-card shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2 font-[family-name:var(--font-display)] text-lg font-bold tracking-[-0.02em]">
                <Webhook className="h-5 w-5 text-primary" />
                Webhooks de Saída
              </CardTitle>
              <CardDescription className="mt-1">
                Notifique seu CRM (HubSpot, Pipedrive, Salesforce) quando oportunidades forem atualizadas.
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleShowDeliveries}>
                Ver entregas
              </Button>
              <Button size="sm" onClick={() => setShowWebhookDialog(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Adicionar
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {webhooks.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              Nenhum webhook configurado. Clique em "Adicionar" para criar um.
            </p>
          ) : (
            <div className="space-y-3">
              {webhooks.map((wh) => (
                <div key={wh.id} className="flex items-start justify-between gap-4 rounded-xl border border-border p-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{wh.targetUrl}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{wh.events.join(', ')}</p>
                    {wh.lastDelivery && (
                      <p className="text-xs mt-1">
                        <span className={wh.lastDelivery.status === 'delivered' ? 'text-success' : 'text-destructive'}>
                          {wh.lastDelivery.status}
                        </span>
                        {wh.lastDelivery.responseCode && (
                          <span className="text-muted-foreground"> · {wh.lastDelivery.responseCode}</span>
                        )}
                        <span className="text-muted-foreground"> · {formatDate(wh.lastDelivery.createdAt)}</span>
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button variant="ghost" size="sm" onClick={() => handleTestWebhook(wh.id)}>
                      <Send className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDeleteWebhook(wh.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog: criar webhook */}
      <Dialog open={showWebhookDialog} onOpenChange={setShowWebhookDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-[family-name:var(--font-display)] font-bold tracking-[-0.02em]">Adicionar webhook</DialogTitle>
            <DialogDescription>
              O Radar enviará um POST com assinatura HMAC-SHA256 no header X-Radar-Signature.
            </DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="webhook-url">URL de destino</FieldLabel>
            <Input
              id="webhook-url"
              placeholder="https://hooks.example.com/radar"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
            />
          </Field>
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">Eventos</p>
            {[
              { value: 'opportunity.updated', label: 'Oportunidade atualizada (qualquer status)' },
              { value: 'opportunity.won', label: 'Apenas quando marcada como Ganho' },
            ].map(({ value, label }) => (
              <div key={value} className="flex items-center gap-2">
                <Checkbox
                  id={value}
                  checked={webhookEvents.includes(value)}
                  onCheckedChange={(checked) => {
                    setWebhookEvents((prev) =>
                      checked ? [...prev, value] : prev.filter((e) => e !== value)
                    )
                  }}
                />
                <label htmlFor={value} className="text-sm text-foreground cursor-pointer">{label}</label>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowWebhookDialog(false)}>Cancelar</Button>
            <Button onClick={handleCreateWebhook} disabled={isCreatingWebhook || !webhookUrl.trim()}>
              {isCreatingWebhook && <Spinner className="mr-2 h-4 w-4" />}
              Criar webhook
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: entregas recentes */}
      <Dialog open={showDeliveriesDialog} onOpenChange={setShowDeliveriesDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-[family-name:var(--font-display)] font-bold tracking-[-0.02em]">Últimas entregas</DialogTitle>
          </DialogHeader>
          {deliveries.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">Nenhuma entrega ainda.</p>
          ) : (
            <div className="max-h-80 overflow-y-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="pb-2 pr-3 font-medium">Evento</th>
                    <th className="pb-2 pr-3 font-medium">Status</th>
                    <th className="pb-2 pr-3 font-medium">Código</th>
                    <th className="pb-2 font-medium">Data</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {deliveries.map((d) => (
                    <tr key={d.id}>
                      <td className="py-1.5 pr-3 font-mono">{d.event}</td>
                      <td className={`py-1.5 pr-3 ${d.status === 'delivered' ? 'text-success' : 'text-destructive'}`}>{d.status}</td>
                      <td className="py-1.5 pr-3">{d.responseCode ?? '—'}</td>
                      <td className="py-1.5">{formatDate(d.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeliveriesDialog(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AlertDialog: confirmar revogação */}
      <AlertDialog open={!!revokeTarget} onOpenChange={() => setRevokeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revogar chave &ldquo;{revokeTarget?.name}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              Integrações que usam esta chave pararão de funcionar imediatamente. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleRevoke}
            >
              Revogar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export default function IntegrationsPage() {
  return (
    <ProtectedRoute requiredRoles={['admin']}>
      <IntegrationsPageContent />
    </ProtectedRoute>
  )
}
