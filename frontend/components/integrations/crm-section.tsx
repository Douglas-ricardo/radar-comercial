'use client'

import { useState, useEffect, useCallback } from 'react'
import { api } from '@/lib/api/client'
import { useAuth } from '@/lib/auth/auth-context'
import { toast } from 'sonner'
import type { CrmConnection } from '@/types'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Plug, RefreshCw, Trash2, CheckCircle2, AlertTriangle } from 'lucide-react'

const PROVIDERS = [
  { id: 'hubspot', name: 'HubSpot', fields: [{ key: 'token', label: 'Private App Token' }] },
  { id: 'pipedrive', name: 'Pipedrive', fields: [{ key: 'api_token', label: 'API Token' }] },
  { id: 'salesforce', name: 'Salesforce', fields: [{ key: 'access_token', label: 'Access Token' }, { key: 'instance_url', label: 'Instance URL' }] },
] as const

export function CrmSection() {
  const { company } = useAuth()
  const isEnterprise = company?.plan === 'enterprise'
  const [conns, setConns] = useState<CrmConnection[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState<string | null>(null)

  const [dialogProvider, setDialogProvider] = useState<typeof PROVIDERS[number] | null>(null)
  const [creds, setCreds] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await api.crm.list()
    if (res.success && res.data) setConns(res.data)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function handleConnect() {
    if (!dialogProvider) return
    setSaving(true)
    const res = await api.crm.create({ provider: dialogProvider.id, credentials: creds })
    setSaving(false)
    if (res.success) {
      toast.success(`${dialogProvider.name} conectado.`)
      setDialogProvider(null); setCreds({}); load()
    } else {
      toast.error(res.error ?? 'Falha ao validar a conexão.')
    }
  }

  async function handleSync(id: string) {
    setSyncing(id)
    await api.crm.sync(id)
    toast.success('Sincronização iniciada.')
    setTimeout(() => { setSyncing(null); load() }, 1500)
  }

  async function handleRemove(id: string) {
    const res = await api.crm.remove(id)
    if (res.success) { setConns(prev => prev.filter(c => c.id !== id)); toast.success('Conexão removida.') }
  }

  const connectedProviders = new Set(conns.map(c => c.provider))

  return (
    <Card className="rounded-2xl border border-border bg-card shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-[family-name:var(--font-display)] text-lg font-bold tracking-[-0.02em]">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent"><Plug className="h-4 w-4 text-primary" /></span>
          CRM bidirecional
          {!isEnterprise && <Badge variant="outline" className="ml-1 text-xs">Enterprise</Badge>}
        </CardTitle>
        <CardDescription>Sincronize contatos do CRM e empurre negócios ganhos/perdidos automaticamente.</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : (
          <div className="space-y-4">
            {/* Conexões ativas */}
            {conns.map(c => {
              const meta = PROVIDERS.find(p => p.id === c.provider)
              return (
                <div key={c.id} className="flex items-center justify-between rounded-xl border border-border px-4 py-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{meta?.name ?? c.provider}</span>
                      {c.lastSyncStatus === 'ok' && <Badge className="rounded-full border-0 bg-success/10 text-success text-xs"><CheckCircle2 className="h-3 w-3 mr-1" />sincronizado</Badge>}
                      {c.lastSyncStatus === 'error' && <Badge className="rounded-full border-0 bg-destructive/10 text-destructive text-xs"><AlertTriangle className="h-3 w-3 mr-1" />erro</Badge>}
                      {c.pushEnabled && <Badge variant="outline" className="text-xs">push ativo</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {c.lastSyncAt ? `Último sync: ${new Date(c.lastSyncAt).toLocaleString('pt-BR')}` : 'Nunca sincronizado'}
                      {c.lastSyncError ? ` · ${c.lastSyncError}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="sm" onClick={() => handleSync(c.id)} disabled={syncing === c.id}>
                      <RefreshCw className={`h-4 w-4 mr-1 ${syncing === c.id ? 'animate-spin' : ''}`} /> Sincronizar
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleRemove(c.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                </div>
              )
            })}

            {/* Provedores disponíveis para conectar */}
            <div className="flex flex-wrap gap-2">
              {PROVIDERS.filter(p => !connectedProviders.has(p.id)).map(p => (
                <Button key={p.id} variant="outline" size="sm" disabled={!isEnterprise}
                  onClick={() => { setDialogProvider(p); setCreds({}) }}>
                  <Plug className="h-4 w-4 mr-1" /> Conectar {p.name}
                </Button>
              ))}
            </div>
          </div>
        )}
      </CardContent>

      <Dialog open={!!dialogProvider} onOpenChange={(o) => !o && setDialogProvider(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-[family-name:var(--font-display)] font-bold tracking-[-0.02em]">Conectar {dialogProvider?.name}</DialogTitle>
            <DialogDescription>As credenciais são validadas contra a API e armazenadas cifradas.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            {dialogProvider?.fields.map(f => (
              <div key={f.key} className="space-y-1">
                <Label>{f.label}</Label>
                <Input type={f.key.includes('token') ? 'password' : 'text'} value={creds[f.key] ?? ''}
                  onChange={e => setCreds(c => ({ ...c, [f.key]: e.target.value }))} />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogProvider(null)}>Cancelar</Button>
            <Button onClick={handleConnect} disabled={saving}>{saving && <Spinner className="mr-2 h-4 w-4" />}Conectar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
