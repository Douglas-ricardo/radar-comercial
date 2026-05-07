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
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Field, FieldLabel } from '@/components/ui/field'
import { Plug2, Plus, Copy, Trash2, Key, Clock, CheckCircle2 } from 'lucide-react'
import { api } from '@/lib/api/client'
import { toast } from 'sonner'
import type { ApiKey, NewApiKey } from '@/types'

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

  const loadKeys = useCallback(async () => {
    setIsLoading(true)
    const res = await api.integrations.listKeys()
    if (res.success && res.data) setKeys(res.data)
    setIsLoading(false)
  }, [])

  useEffect(() => { loadKeys() }, [loadKeys])

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
              <CardTitle className="flex items-center gap-2">
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

        {/* Docs */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Como usar</CardTitle>
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
              <CheckCircle2 className="h-5 w-5 text-green-600" />
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
              <CheckCircle2 className="mr-2 h-4 w-4 text-green-600" />
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
