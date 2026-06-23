'use client'

import { useState, useEffect, useCallback } from 'react'
import { api } from '@/lib/api/client'
import { useAuth } from '@/lib/auth/auth-context'
import { toast } from 'sonner'
import type { MfaStatus, MfaSetup, UserSessionEntry } from '@/types'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ShieldCheck, ShieldOff, Smartphone, Monitor, KeyRound, Copy, Trash2 } from 'lucide-react'

export function SecurityTab() {
  const { company, updateCompany } = useAuth()
  const isAdmin = useAuth().user?.role === 'admin'
  const isEnterprise = company?.plan === 'enterprise'

  const [mfa, setMfa] = useState<MfaStatus | null>(null)
  const [sessions, setSessions] = useState<UserSessionEntry[]>([])
  const [loading, setLoading] = useState(true)

  // setup flow
  const [setupData, setSetupData] = useState<MfaSetup | null>(null)
  const [setupCode, setSetupCode] = useState('')
  const [enabling, setEnabling] = useState(false)
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null)

  // disable flow
  const [disableOpen, setDisableOpen] = useState(false)
  const [disablePassword, setDisablePassword] = useState('')

  // IP allowlist
  const [ipInput, setIpInput] = useState((company?.ipAllowlist ?? []).join(', '))
  const [savingIps, setSavingIps] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [mfaRes, sessRes] = await Promise.all([api.mfa.status(), api.auth.listSessions()])
    if (mfaRes.success && mfaRes.data) setMfa(mfaRes.data)
    if (sessRes.success && sessRes.data) setSessions(sessRes.data)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function startSetup() {
    const res = await api.mfa.setup()
    if (res.success && res.data) setSetupData(res.data)
    else toast.error(res.error ?? 'Erro ao iniciar configuração do MFA.')
  }

  async function confirmEnable() {
    setEnabling(true)
    const res = await api.mfa.enable(setupCode)
    setEnabling(false)
    if (res.success && res.data) {
      setBackupCodes(res.data.backupCodes)
      setSetupData(null)
      setSetupCode('')
      toast.success('MFA ativado com sucesso.')
      load()
    } else {
      toast.error(res.error ?? 'Código inválido.')
    }
  }

  async function confirmDisable() {
    const res = await api.mfa.disable(disablePassword)
    if (res.success) {
      toast.success('MFA desativado.')
      setDisableOpen(false)
      setDisablePassword('')
      load()
    } else {
      toast.error(res.error ?? 'Senha incorreta.')
    }
  }

  async function regenerate() {
    const res = await api.mfa.regenerateBackupCodes()
    if (res.success && res.data) {
      setBackupCodes(res.data.backupCodes)
      toast.success('Novos códigos de backup gerados.')
      load()
    }
  }

  async function revoke(id: string) {
    const res = await api.auth.revokeSession(id)
    if (res.success) {
      setSessions(prev => prev.filter(s => s.id !== id))
      toast.success('Sessão encerrada.')
    }
  }

  async function revokeOthers() {
    const res = await api.auth.revokeOtherSessions()
    if (res.success) {
      toast.success('Outras sessões encerradas.')
      load()
    }
  }

  async function saveIps() {
    if (!company) return
    setSavingIps(true)
    const list = ipInput.split(',').map(s => s.trim()).filter(Boolean)
    const res = await api.company.update(company.id, { ipAllowlist: list })
    setSavingIps(false)
    if (res.success && res.data) {
      updateCompany({ ipAllowlist: res.data.ipAllowlist })
      toast.success('Lista de IPs atualizada.')
    } else {
      toast.error(res.error ?? 'Erro ao salvar IPs.')
    }
  }

  if (loading) {
    return <div className="flex justify-center py-12"><Spinner /></div>
  }

  return (
    <div className="space-y-6">
      {/* MFA */}
      <Card className="rounded-2xl border border-border bg-card shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-[family-name:var(--font-display)] text-lg font-bold tracking-[-0.02em]">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent">
              <ShieldCheck className="h-4 w-4 text-primary" />
            </span>
            Autenticação de dois fatores (2FA)
          </CardTitle>
          <CardDescription>
            Adicione uma camada extra de segurança exigindo um código do app autenticador no login.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {mfa?.enabled ? (
            <div className="flex items-center justify-between rounded-xl border border-success/30 bg-success/[0.06] px-4 py-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-success" />
                <div>
                  <p className="text-sm font-medium text-foreground">2FA ativo</p>
                  <p className="text-xs text-muted-foreground">{mfa.backupCodesRemaining} códigos de backup restantes</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={regenerate}>
                  <KeyRound className="h-4 w-4 mr-1" /> Novos backups
                </Button>
                <Button variant="outline" size="sm" onClick={() => setDisableOpen(true)}>
                  <ShieldOff className="h-4 w-4 mr-1" /> Desativar
                </Button>
              </div>
            </div>
          ) : setupData ? (
            <div className="space-y-4">
              <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={setupData.qrcode} alt="QR Code 2FA" className="h-44 w-44 rounded-lg border border-border" />
                <div className="space-y-2 text-sm">
                  <p className="text-muted-foreground">1. Escaneie o QR no Google Authenticator, Authy ou 1Password.</p>
                  <p className="text-muted-foreground">2. Ou insira o código manual:</p>
                  <code className="block rounded bg-muted px-2 py-1 text-xs break-all">{setupData.secret}</code>
                  <p className="text-muted-foreground">3. Digite o código gerado para confirmar:</p>
                  <Input
                    inputMode="numeric"
                    placeholder="000000"
                    value={setupCode}
                    onChange={e => setSetupCode(e.target.value)}
                    className="w-40 text-center tracking-[0.3em] tabular-nums"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button onClick={confirmEnable} disabled={enabling || setupCode.length < 6}>
                  {enabling && <Spinner className="mr-2 h-4 w-4" />}Ativar 2FA
                </Button>
                <Button variant="ghost" onClick={() => { setSetupData(null); setSetupCode('') }}>Cancelar</Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between rounded-xl border border-border bg-muted/30 px-4 py-3">
              <div className="flex items-center gap-2">
                <ShieldOff className="h-5 w-5 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">2FA desativado</p>
              </div>
              <Button size="sm" onClick={startSetup}><Smartphone className="h-4 w-4 mr-1" /> Ativar 2FA</Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sessões ativas */}
      <Card className="rounded-2xl border border-border bg-card shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 font-[family-name:var(--font-display)] text-lg font-bold tracking-[-0.02em]">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent">
                <Monitor className="h-4 w-4 text-primary" />
              </span>
              Sessões ativas
            </CardTitle>
            <CardDescription>Dispositivos conectados à sua conta.</CardDescription>
          </div>
          {sessions.length > 1 && (
            <Button variant="outline" size="sm" onClick={revokeOthers}>Encerrar outras</Button>
          )}
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {sessions.map(s => (
              <div key={s.id} className="flex items-center justify-between rounded-xl border border-border bg-secondary/20 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {s.userAgent ?? 'Dispositivo desconhecido'}
                    {s.current && <Badge className="ml-2 rounded-full border-0 bg-success/10 text-success text-xs">Esta sessão</Badge>}
                  </p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {s.ip ?? '—'} · último acesso {s.lastSeenAt ? new Date(s.lastSeenAt).toLocaleString('pt-BR') : '—'}
                  </p>
                </div>
                {!s.current && (
                  <button onClick={() => revoke(s.id)} className="text-muted-foreground hover:text-destructive transition-colors ml-3 shrink-0">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* IP allowlist (admin + enterprise) */}
      {isAdmin && (
        <Card className="rounded-2xl border border-border bg-card shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-[family-name:var(--font-display)] text-lg font-bold tracking-[-0.02em]">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent">
                <ShieldCheck className="h-4 w-4 text-primary" />
              </span>
              Restrição de IP
              {!isEnterprise && <Badge variant="outline" className="ml-1 text-xs">Enterprise</Badge>}
            </CardTitle>
            <CardDescription>
              Permita login apenas de IPs/CIDRs específicos. Vazio = sem restrição. Ex: 200.10.0.0/16, 187.1.2.3
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Label htmlFor="ip-allowlist">IPs/CIDRs permitidos (separados por vírgula)</Label>
            <Input
              id="ip-allowlist"
              className="mt-1.5"
              placeholder="200.10.0.0/16, 187.1.2.3"
              value={ipInput}
              onChange={e => setIpInput(e.target.value)}
              disabled={!isEnterprise}
            />
          </CardContent>
          <CardFooter className="border-t pt-6">
            <Button onClick={saveIps} disabled={!isEnterprise || savingIps}>
              {savingIps && <Spinner className="mr-2 h-4 w-4" />}Salvar restrição
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* Backup codes dialog */}
      <Dialog open={!!backupCodes} onOpenChange={(o) => !o && setBackupCodes(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-[family-name:var(--font-display)] font-bold tracking-[-0.02em]">Códigos de backup</DialogTitle>
            <DialogDescription>
              Guarde estes códigos em local seguro. Cada um funciona uma única vez se você perder o acesso ao app autenticador.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2 rounded-xl border border-border bg-muted/40 p-4 font-mono text-sm tabular-nums">
            {(backupCodes ?? []).map(c => <span key={c} className="text-center">{c}</span>)}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              navigator.clipboard.writeText((backupCodes ?? []).join('\n')).then(() => toast.success('Códigos copiados.'))
            }}>
              <Copy className="h-4 w-4 mr-1" /> Copiar
            </Button>
            <Button onClick={() => setBackupCodes(null)}>Concluído</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Disable MFA dialog */}
      <Dialog open={disableOpen} onOpenChange={setDisableOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-[family-name:var(--font-display)] font-bold tracking-[-0.02em]">Desativar 2FA</DialogTitle>
            <DialogDescription>Confirme sua senha para desativar a autenticação de dois fatores.</DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Label htmlFor="disable-pwd">Senha</Label>
            <Input id="disable-pwd" type="password" className="mt-1.5" value={disablePassword}
              onChange={e => setDisablePassword(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDisableOpen(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={confirmDisable} disabled={!disablePassword}>Desativar 2FA</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
