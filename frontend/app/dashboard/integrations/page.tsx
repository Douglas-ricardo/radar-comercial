'use client'

import { useState, useEffect, useCallback } from 'react'
import { DashboardHeader } from '@/components/dashboard/header'
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
import { Plug2, Plus, Copy, Trash2, Key, Clock, CheckCircle2, RefreshCw } from 'lucide-react'
import { api } from '@/lib/api/client'
import { toast } from 'sonner'
import type { ApiKey, NewApiKey, SyncConfig } from '@/types'

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso))
}

export default function IntegrationsPage() {
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isCreating, setIsCreating] = useState(false)
  const [newKeyName, setNewKeyName] = useState('')
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [createdKey, setCreatedKey] = useState<NewApiKey | null>(null)
  const [revokeTarget, setRevokeTarget] = useState<ApiKey | null>(null)
  const [copied, setCopied] = useState(false)

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
    const res = await api.integrations.listKeys()
    if (res.success && res.data) setKeys(res.data)
    setIsLoading(false)
  }, [])

  const loadSyncConfig = useCallback(async () => {
    setSyncLoading(true)
    const res = await api.integrations.getSyncStatus()
    if (res.success && res.data) {
      setSyncConfig(res.data)
      setSheetUrl(res.data.sheetUrl ?? '')
      setSheetName(res.data.sheetName ?? '')
      setSyncEnabled(res.data.enabled)
    }
    setSyncLoading(false)
  }, [])

  useEffect(() => {
    loadKeys()
    loadSyncConfig()
  }, [loadKeys, loadSyncConfig])

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
      <div className="flex-1 p-6 space-y-6">

        {/* API Keys */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 font-serif text-lg font-medium tracking-[-0.01em]">
                <Key className="h-5 w-5" />
                API Keys
              </CardTitle>
              <CardDescription>
                Use estas chaves no header <code className="bg-muted px-1 rounded text-xs">X-API-Key</code> para ingerir dados via <code className="bg-muted px-1 rounded text-xs">POST /api/data/ingest</code>
              </CardDescription>
            </div>
            <Button onClick={() => setShowCreateDialog(true)} size="sm">
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
              <div className="text-center py-8 text-muted-foreground">
                <Plug2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Nenhuma chave criada ainda.</p>
                <p className="text-xs mt-1">Crie uma chave para integrar seu ERP ou n8n.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {keys.map((key) => (
                  <div
                    key={key.id}
                    className="flex items-center justify-between rounded-lg border border-border px-4 py-3"
                  >
                    <div className="space-y-0.5">
                      <p className="font-medium text-sm">{key.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">
                        {key.prefix}••••••••••••••••••••
                      </p>
                      <div className="flex items-center gap-3 mt-1">
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
                      className="text-destructive hover:text-destructive h-8 w-8"
                      onClick={() => setRevokeTarget(key)}
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
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-serif text-lg font-medium tracking-[-0.01em]">
              <RefreshCw className="h-5 w-5" />
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
                  <div className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${
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

                <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">Sincronização automática</p>
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
        <Card>
          <CardHeader>
            <CardTitle className="font-serif text-base font-medium tracking-[-0.01em]">Como usar</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <p>Envie dados de vendas programaticamente com uma requisição POST:</p>
            <pre className="bg-muted rounded-lg p-4 text-xs overflow-auto">
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
              <Badge variant="secondary">n8n</Badge>
              <Badge variant="secondary">Omie</Badge>
              <Badge variant="secondary">Bling</Badge>
              <Badge variant="secondary">Conta Azul</Badge>
              <Badge variant="secondary">Google Sheets</Badge>
              <Badge variant="secondary">Zapier</Badge>
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
          <div className="rounded-lg border bg-muted p-3 font-mono text-sm break-all">
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
