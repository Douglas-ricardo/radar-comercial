'use client'

import { useState, useEffect, useCallback } from 'react'
import { api } from '@/lib/api/client'
import { useAuth } from '@/lib/auth/auth-context'
import { toast } from 'sonner'
import type { SSOConnection } from '@/types'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { KeyRound, Plus, Trash2, Copy, Link2, ShieldCheck } from 'lucide-react'

function CopyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-2">
        <code className="flex-1 truncate rounded bg-muted px-2 py-1.5 text-xs">{value}</code>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0"
          onClick={() => navigator.clipboard.writeText(value).then(() => toast.success('Copiado.'))}>
          <Copy className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}

export function SSOTab() {
  const { company } = useAuth()
  const isEnterprise = company?.plan === 'enterprise'

  const [slug, setSlug] = useState('')
  const [connections, setConnections] = useState<SSOConnection[]>([])
  const [loading, setLoading] = useState(true)

  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState({
    protocol: 'oidc' as 'oidc' | 'saml',
    displayName: '',
    defaultRole: 'viewer',
    allowedDomains: '',
    issuer: '',
    clientId: '',
    clientSecret: '',
    idpMetadata: '',
  })
  const [saving, setSaving] = useState(false)

  const [scimToken, setScimToken] = useState<{ token: string; scimBaseUrl: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await api.sso.listConnections()
    if (res.success && res.data) {
      setSlug(res.data.slug)
      setConnections(res.data.connections)
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function handleCreate() {
    setSaving(true)
    const res = await api.sso.createConnection({
      protocol: form.protocol,
      displayName: form.displayName || undefined,
      defaultRole: form.defaultRole,
      allowedDomains: form.allowedDomains.split(',').map(s => s.trim()).filter(Boolean),
      issuer: form.issuer || undefined,
      clientId: form.clientId || undefined,
      clientSecret: form.clientSecret || undefined,
      idpMetadata: form.idpMetadata || undefined,
    })
    setSaving(false)
    if (res.success) {
      toast.success('Conexão SSO criada.')
      setCreateOpen(false)
      setForm({ protocol: 'oidc', displayName: '', defaultRole: 'viewer', allowedDomains: '', issuer: '', clientId: '', clientSecret: '', idpMetadata: '' })
      load()
    } else {
      toast.error(res.error ?? 'Erro ao criar conexão.')
    }
  }

  async function handleDelete(id: string) {
    const res = await api.sso.deleteConnection(id)
    if (res.success) {
      setConnections(prev => prev.filter(c => c.id !== id))
      toast.success('Conexão removida.')
    }
  }

  async function genScimToken() {
    const res = await api.sso.createScimToken()
    if (res.success && res.data) {
      setScimToken(res.data)
    } else {
      toast.error(res.error ?? 'Erro ao gerar token SCIM.')
    }
  }

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>

  return (
    <div className="space-y-6">
      {!isEnterprise && (
        <div className="rounded-xl border border-primary/30 bg-accent/40 px-4 py-3 text-sm">
          <Badge variant="outline" className="mr-2">Enterprise</Badge>
          SSO e provisionamento automático (SCIM) estão disponíveis no plano Enterprise.
        </div>
      )}

      {/* Conexões SSO */}
      <Card className="rounded-2xl border border-border bg-card shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 font-[family-name:var(--font-display)] text-lg font-bold tracking-[-0.02em]">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent"><KeyRound className="h-4 w-4 text-primary" /></span>
              Single Sign-On (SSO)
            </CardTitle>
            <CardDescription>Permita login via Okta, Azure AD, Google Workspace (OIDC ou SAML).</CardDescription>
          </div>
          <Button size="sm" onClick={() => setCreateOpen(true)} disabled={!isEnterprise}>
            <Plus className="h-4 w-4 mr-1" /> Nova conexão
          </Button>
        </CardHeader>
        <CardContent>
          {connections.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Nenhuma conexão SSO configurada.</p>
          ) : (
            <div className="space-y-3">
              {connections.map(c => (
                <div key={c.id} className="rounded-xl border border-border p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{c.displayName ?? c.protocol.toUpperCase()}</span>
                      <Badge variant="outline" className="text-xs uppercase">{c.protocol}</Badge>
                      <Badge variant="outline" className="text-xs">papel: {c.defaultRole}</Badge>
                      {c.allowedDomains.length > 0 && (
                        <span className="text-xs text-muted-foreground">{c.allowedDomains.join(', ')}</span>
                      )}
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(c.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <CopyField label="URL de login (SP)" value={c.loginUrl} />
                    <CopyField label={c.protocol === 'oidc' ? 'Redirect URI (callback)' : 'ACS URL'} value={c.callbackUrl} />
                    {c.metadataUrl && <CopyField label="Metadata SP (SAML)" value={c.metadataUrl} />}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* SCIM */}
      <Card className="rounded-2xl border border-border bg-card shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 font-[family-name:var(--font-display)] text-lg font-bold tracking-[-0.02em]">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent"><Link2 className="h-4 w-4 text-primary" /></span>
              Provisionamento automático (SCIM 2.0)
            </CardTitle>
            <CardDescription>Crie/desative usuários automaticamente a partir do seu IdP.</CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={genScimToken} disabled={!isEnterprise}>
            <ShieldCheck className="h-4 w-4 mr-1" /> Gerar token
          </Button>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Gere um token Bearer e configure-o no seu IdP junto da Base URL SCIM. O token é mostrado apenas uma vez.
          </p>
        </CardContent>
      </Card>

      {/* Create connection dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-[family-name:var(--font-display)] font-bold tracking-[-0.02em]">Nova conexão SSO</DialogTitle>
            <DialogDescription>Configure o provedor de identidade da sua organização.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Protocolo</Label>
                <Select value={form.protocol} onValueChange={(v) => setForm(f => ({ ...f, protocol: v as 'oidc' | 'saml' }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="oidc">OIDC (Azure AD, Google, Okta)</SelectItem>
                    <SelectItem value="saml">SAML 2.0</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Papel padrão</Label>
                <Select value={form.defaultRole} onValueChange={(v) => setForm(f => ({ ...f, defaultRole: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="viewer">Viewer</SelectItem>
                    <SelectItem value="analyst">Analyst</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Nome de exibição</Label>
              <Input placeholder="Ex: Okta da Acme" value={form.displayName} onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Domínios permitidos (separados por vírgula)</Label>
              <Input placeholder="acme.com, acme.com.br" value={form.allowedDomains} onChange={e => setForm(f => ({ ...f, allowedDomains: e.target.value }))} />
            </div>
            {form.protocol === 'oidc' ? (
              <>
                <div className="space-y-1">
                  <Label>Issuer (discovery URL base)</Label>
                  <Input placeholder="https://login.microsoftonline.com/{tenant}/v2.0" value={form.issuer} onChange={e => setForm(f => ({ ...f, issuer: e.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Client ID</Label>
                    <Input value={form.clientId} onChange={e => setForm(f => ({ ...f, clientId: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>Client Secret</Label>
                    <Input type="password" value={form.clientSecret} onChange={e => setForm(f => ({ ...f, clientSecret: e.target.value }))} />
                  </div>
                </div>
              </>
            ) : (
              <div className="space-y-1">
                <Label>Metadata XML do IdP</Label>
                <Textarea rows={5} placeholder="<EntityDescriptor ...>" value={form.idpMetadata} onChange={e => setForm(f => ({ ...f, idpMetadata: e.target.value }))} />
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
              <Button onClick={handleCreate} disabled={saving}>{saving && <Spinner className="mr-2 h-4 w-4" />}Criar conexão</Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* SCIM token dialog */}
      <Dialog open={!!scimToken} onOpenChange={(o) => !o && setScimToken(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-[family-name:var(--font-display)] font-bold tracking-[-0.02em]">Token SCIM gerado</DialogTitle>
            <DialogDescription>Copie agora — por segurança, o token não será mostrado novamente.</DialogDescription>
          </DialogHeader>
          {scimToken && (
            <div className="space-y-3">
              <CopyField label="Bearer Token" value={scimToken.token} />
              <CopyField label="SCIM Base URL" value={scimToken.scimBaseUrl} />
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setScimToken(null)}>Concluído</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
