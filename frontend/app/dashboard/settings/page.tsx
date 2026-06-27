//app/dashboard/settings/page.tsx
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { DashboardHeader } from '@/components/dashboard/header'
import { useAuth } from '@/lib/auth/auth-context'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Spinner } from '@/components/ui/spinner'
import { Building2, User, CreditCard, Lock, Bell, Send, FileText, Plus, Trash2, Calendar, ShieldCheck, KeyRound } from 'lucide-react'
import { SecurityTab } from '@/components/settings/security-tab'
import { SSOTab } from '@/components/settings/sso-tab'
import { RbacTab } from '@/components/settings/rbac-tab'
import { ComplianceTab } from '@/components/settings/compliance-tab'
import { UsageCard } from '@/components/settings/usage-card'
import { Shield, Sparkles } from 'lucide-react'
import { api } from '@/lib/api/client'
import { toast } from 'sonner'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import type { NotificationPreference, ScheduledReport } from '@/types'

export default function SettingsPage() {
  const { user, company, updateUser, updateCompany } = useAuth()
  const router = useRouter()
  const isAdmin = user?.role === 'admin'
  const canManageNotif = user?.role === 'admin' || user?.role === 'analyst'

  const [isSavingProfile, setIsSavingProfile] = useState(false)
  const [isSavingCompany, setIsSavingCompany] = useState(false)
  const [isChangingPassword, setIsChangingPassword] = useState(false)
  const [isSavingNotif, setIsSavingNotif] = useState(false)
  const [isSendingTest, setIsSendingTest] = useState(false)
  const [schedules, setSchedules] = useState<ScheduledReport[]>([])
  const [scheduleDialog, setScheduleDialog] = useState(false)
  const [newSchedule, setNewSchedule] = useState({ frequency: 'weekly', dayOfWeek: '1', recipients: '', dateRange: '1m' })
  const [notifPrefs, setNotifPrefs] = useState<NotificationPreference>({
    enabled: true,
    emailEnabled: true,
    whatsappEnabled: false,
    whatsappPhone: null,
    sendHour: 8,
    minOpportunityValue: 0,
  })

  const [profileData, setProfileData] = useState({
    name: user?.name ?? '',
  })
  const [companyData, setCompanyData] = useState({
    name: company?.name ?? '',
    purchaseCycleDays: company?.purchaseCycleDays ?? 90,
    currency: company?.currency ?? 'BRL',
  })
  const [passwordData, setPasswordData] = useState({
    current: '',
    next: '',
    confirm: '',
  })

  useEffect(() => {
    api.notifications.getPreferences().then((res) => {
      if (res.success && res.data) setNotifPrefs(res.data)
    })
    if (company?.id) {
      api.reports.listSchedules(company.id).then((res) => {
        if (res.success && res.data) setSchedules(res.data)
      })
    }
  }, [company?.id])

  const handleSaveNotifications = async () => {
    setIsSavingNotif(true)
    try {
      const res = await api.notifications.updatePreferences(notifPrefs)
      if (res.success) toast.success('Notificações atualizadas.')
      else toast.error(res.error ?? 'Erro ao salvar.')
    } catch {
      toast.error('Erro de conexão.')
    } finally {
      setIsSavingNotif(false)
    }
  }

  const handleTestSend = async () => {
    setIsSendingTest(true)
    try {
      const res = await api.notifications.testSend()
      if (res.success) toast.success('Notificação de teste enviada!')
      else toast.error(res.error ?? res.message ?? 'Verifique as configurações de email/WhatsApp.')
    } catch {
      toast.error('Erro de conexão.')
    } finally {
      setIsSendingTest(false)
    }
  }

  const passwordsMatch = passwordData.next === passwordData.confirm
  const passwordValid = passwordData.next.length >= 8
  const canSubmitPassword =
    !!passwordData.current && passwordValid && passwordsMatch

  // Persiste perfil no backend e atualiza contexto local
  const handleSaveProfile = async () => {
    if (!user?.id) return
    setIsSavingProfile(true)
    try {
      const response = await api.user.update(user.id, { name: profileData.name })
      if (response.success && response.data) {
        updateUser({ name: response.data.name })
        toast.success('Perfil atualizado com sucesso.')
      } else {
        toast.error(response.error ?? 'Não foi possível salvar o perfil.')
      }
    } catch {
      toast.error('Erro de conexão. Tente novamente.')
    } finally {
      setIsSavingProfile(false)
    }
  }

  const handleChangePassword = async () => {
    if (!canSubmitPassword) return
    setIsChangingPassword(true)
    try {
      const response = await api.auth.changePassword(
        passwordData.current,
        passwordData.next,
      )
      if (response.success) {
        toast.success('Senha alterada com sucesso.')
        setPasswordData({ current: '', next: '', confirm: '' })
      } else {
        toast.error(response.error ?? 'Não foi possível alterar a senha.')
      }
    } catch {
      toast.error('Erro de conexão. Tente novamente.')
    } finally {
      setIsChangingPassword(false)
    }
  }

  const handleCreateSchedule = async () => {
    if (!company?.id) return
    const recipientList = newSchedule.recipients.split(',').map(e => e.trim()).filter(Boolean)
    if (!recipientList.length) { toast.error('Informe ao menos um destinatário.'); return }
    const res = await api.reports.createSchedule(company.id, {
      frequency: newSchedule.frequency,
      dayOfWeek: newSchedule.frequency === 'weekly' ? parseInt(newSchedule.dayOfWeek) : null,
      recipients: recipientList,
      dateRange: newSchedule.dateRange,
    })
    if (res.success) {
      toast.success('Relatório agendado.')
      setScheduleDialog(false)
      setNewSchedule({ frequency: 'weekly', dayOfWeek: '1', recipients: '', dateRange: '1m' })
      const listRes = await api.reports.listSchedules(company.id)
      if (listRes.success && listRes.data) setSchedules(listRes.data)
    } else {
      toast.error(res.error ?? 'Erro ao criar agendamento.')
    }
  }

  const handleDeleteSchedule = async (id: string) => {
    if (!company?.id) return
    const res = await api.reports.deleteSchedule(company.id, id)
    if (res.success) {
      toast.success('Agendamento removido.')
      setSchedules(prev => prev.filter(s => s.id !== id))
    } else {
      toast.error(res.error ?? 'Erro ao remover.')
    }
  }

  // Persiste dados da empresa no backend e atualiza contexto local
  const handleSaveCompany = async () => {
    if (!company?.id) return
    setIsSavingCompany(true)
    try {
      const response = await api.company.update(company.id, {
        name: companyData.name,
        purchaseCycleDays: companyData.purchaseCycleDays,
        currency: companyData.currency,
      })
      if (response.success && response.data) {
        updateCompany({ name: response.data.name, purchaseCycleDays: response.data.purchaseCycleDays, currency: response.data.currency })
        toast.success('Dados da empresa atualizados.')
      } else {
        toast.error(response.error ?? 'Não foi possível salvar os dados da empresa.')
      }
    } catch {
      toast.error('Erro de conexão. Tente novamente.')
    } finally {
      setIsSavingCompany(false)
    }
  }

  const [isSeeding, setIsSeeding] = useState(false)
  const handleSeedDemo = async () => {
    if (!company?.id) return
    setIsSeeding(true)
    try {
      const res = await api.company.seedDemo(company.id)
      if (res.success) {
        updateCompany({ isSandbox: true })
        toast.success('Dados demo gerados. Explore o app com dados de exemplo.')
      } else toast.error(res.error ?? 'Erro ao gerar dados demo.')
    } finally {
      setIsSeeding(false)
    }
  }

  const DAY_LABELS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo']

  return (
    <>
    <Dialog open={scheduleDialog} onOpenChange={setScheduleDialog}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-[family-name:var(--font-display)] font-bold tracking-[-0.02em]">Agendar Relatório</DialogTitle>
          <DialogDescription>O relatório Excel será enviado por email automaticamente.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Frequência</label>
            <Select value={newSchedule.frequency} onValueChange={(v) => setNewSchedule(s => ({ ...s, frequency: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="weekly">Semanal</SelectItem>
                <SelectItem value="monthly">Mensal (todo dia 1)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {newSchedule.frequency === 'weekly' && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Dia da semana</label>
              <Select value={newSchedule.dayOfWeek} onValueChange={(v) => setNewSchedule(s => ({ ...s, dayOfWeek: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DAY_LABELS.map((d, i) => <SelectItem key={i} value={String(i)}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Período do relatório</label>
            <Select value={newSchedule.dateRange} onValueChange={(v) => setNewSchedule(s => ({ ...s, dateRange: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1m">Último mês</SelectItem>
                <SelectItem value="3m">Últimos 3 meses</SelectItem>
                <SelectItem value="6m">Últimos 6 meses</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Destinatários (separados por vírgula)</label>
            <Input
              placeholder="gerente@empresa.com, diretoria@empresa.com"
              value={newSchedule.recipients}
              onChange={(e) => setNewSchedule(s => ({ ...s, recipients: e.target.value }))}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setScheduleDialog(false)}>Cancelar</Button>
          <Button onClick={handleCreateSchedule}>Agendar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <div className="flex flex-col">
      <DashboardHeader
        title="Configurações"
        description="Gerencie sua conta e preferências do Radar"
      />
      <div className="flex-1 p-6 lg:p-8 max-w-[1200px] mx-auto w-full">
        <Tabs defaultValue="profile" className="space-y-6">
          <TabsList>
            <TabsTrigger value="profile" className="gap-2">
              <User className="h-4 w-4" aria-hidden="true" />
              Perfil
            </TabsTrigger>
            <TabsTrigger value="security" className="gap-2">
              <KeyRound className="h-4 w-4" aria-hidden="true" />
              Segurança
            </TabsTrigger>
            {isAdmin && (
              <TabsTrigger value="company" className="gap-2">
                <Building2 className="h-4 w-4" aria-hidden="true" />
                Empresa
              </TabsTrigger>
            )}
            {canManageNotif && (
              <TabsTrigger value="notifications" className="gap-2">
                <Bell className="h-4 w-4" aria-hidden="true" />
                Notificações
              </TabsTrigger>
            )}
            {isAdmin && (
              <TabsTrigger value="billing" className="gap-2">
                <CreditCard className="h-4 w-4" aria-hidden="true" />
                Plano
              </TabsTrigger>
            )}
            {isAdmin && (
              <TabsTrigger value="rbac" className="gap-2">
                <Shield className="h-4 w-4" aria-hidden="true" />
                Papéis
              </TabsTrigger>
            )}
            {isAdmin && (
              <TabsTrigger value="sso" className="gap-2">
                <KeyRound className="h-4 w-4" aria-hidden="true" />
                SSO
              </TabsTrigger>
            )}
            {isAdmin && (
              <TabsTrigger value="audit" className="gap-2">
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                Compliance
              </TabsTrigger>
            )}
          </TabsList>

          {/* Aba Perfil */}
          <TabsContent value="profile" className="space-y-6">
            <Card className="rounded-2xl border border-border bg-card shadow-sm">
              <CardHeader>
                <CardTitle className="font-[family-name:var(--font-display)] text-lg font-bold tracking-[-0.02em]">Perfil pessoal</CardTitle>
                <CardDescription>Como os outros membros te identificam</CardDescription>
              </CardHeader>
              <CardContent>
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="profile-name">Nome completo</FieldLabel>
                    <Input
                      id="profile-name"
                      value={profileData.name}
                      onChange={(e) =>
                        setProfileData((prev) => ({ ...prev, name: e.target.value }))
                      }
                      disabled={isSavingProfile}
                    />
                  </Field>
                  <Field>
                    <FieldLabel>Email</FieldLabel>
                    <Input
                      value={user?.email ?? ''}
                      disabled
                      aria-label="Email (não editável)"
                      className="bg-muted/50 text-muted-foreground cursor-not-allowed"
                    />
                  </Field>
                </FieldGroup>
              </CardContent>
              <CardFooter className="border-t pt-6">
                <Button
                  onClick={handleSaveProfile}
                  disabled={isSavingProfile || !profileData.name.trim()}
                  aria-busy={isSavingProfile}
                >
                  {isSavingProfile && (
                    <Spinner className="mr-2 h-4 w-4" aria-hidden="true" />
                  )}
                  Salvar alterações
                </Button>
              </CardFooter>
            </Card>

            <Card className="rounded-2xl border border-border bg-card shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 font-[family-name:var(--font-display)] text-lg font-bold tracking-[-0.02em]">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent">
                    <Lock className="h-4 w-4 text-primary" aria-hidden="true" />
                  </span>
                  Alterar senha
                </CardTitle>
                <CardDescription>
                  Defina uma nova senha de acesso (mínimo 8 caracteres)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="current-password">Senha atual</FieldLabel>
                    <Input
                      id="current-password"
                      type="password"
                      autoComplete="current-password"
                      value={passwordData.current}
                      onChange={(e) =>
                        setPasswordData((prev) => ({ ...prev, current: e.target.value }))
                      }
                      disabled={isChangingPassword}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="new-password">Nova senha</FieldLabel>
                    <Input
                      id="new-password"
                      type="password"
                      autoComplete="new-password"
                      value={passwordData.next}
                      onChange={(e) =>
                        setPasswordData((prev) => ({ ...prev, next: e.target.value }))
                      }
                      disabled={isChangingPassword}
                      aria-invalid={!!passwordData.next && !passwordValid}
                    />
                    {passwordData.next && !passwordValid && (
                      <p className="text-xs text-destructive">
                        A senha precisa ter no mínimo 8 caracteres.
                      </p>
                    )}
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="confirm-password">Confirmar nova senha</FieldLabel>
                    <Input
                      id="confirm-password"
                      type="password"
                      autoComplete="new-password"
                      value={passwordData.confirm}
                      onChange={(e) =>
                        setPasswordData((prev) => ({ ...prev, confirm: e.target.value }))
                      }
                      disabled={isChangingPassword}
                      aria-invalid={!!passwordData.confirm && !passwordsMatch}
                    />
                    {passwordData.confirm && !passwordsMatch && (
                      <p className="text-xs text-destructive">
                        As senhas não coincidem.
                      </p>
                    )}
                  </Field>
                </FieldGroup>
              </CardContent>
              <CardFooter className="flex items-center justify-between gap-4 border-t pt-6">
                <p className="text-xs text-muted-foreground">
                  Ao alterar a senha, suas outras sessões serão encerradas.
                </p>
                <Button
                  onClick={handleChangePassword}
                  disabled={!canSubmitPassword || isChangingPassword}
                  aria-busy={isChangingPassword}
                >
                  {isChangingPassword && (
                    <Spinner className="mr-2 h-4 w-4" aria-hidden="true" />
                  )}
                  Alterar senha
                </Button>
              </CardFooter>
            </Card>
          </TabsContent>

          {/* Aba Segurança — todos os usuários */}
          <TabsContent value="security">
            <SecurityTab />
          </TabsContent>

          {/* Aba Empresa — admin only */}
          {isAdmin && <TabsContent value="company">
            <Card className="rounded-2xl border border-border bg-card shadow-sm">
              <CardHeader>
                <CardTitle className="font-[family-name:var(--font-display)] text-lg font-bold tracking-[-0.02em]">Dados da empresa</CardTitle>
                <CardDescription>Informações para relatórios e faturamento</CardDescription>
              </CardHeader>
              <CardContent>
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="company-name">Nome comercial</FieldLabel>
                    <Input
                      id="company-name"
                      value={companyData.name}
                      onChange={(e) =>
                        setCompanyData((prev) => ({ ...prev, name: e.target.value }))
                      }
                      disabled={isSavingCompany}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="purchase-cycle">Ciclo de compra médio (dias)</FieldLabel>
                    <Input
                      id="purchase-cycle"
                      type="number"
                      min={1}
                      max={365}
                      value={companyData.purchaseCycleDays}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10)
                        if (!isNaN(v)) setCompanyData((prev) => ({ ...prev, purchaseCycleDays: v }))
                      }}
                      disabled={isSavingCompany}
                    />
                    <p className="text-xs text-muted-foreground">
                      Intervalo típico entre compras no seu ramo. Afeta os scores de risco de churn.
                    </p>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="currency">Moeda</FieldLabel>
                    <Select value={companyData.currency} onValueChange={(v) => setCompanyData((prev) => ({ ...prev, currency: v }))}>
                      <SelectTrigger id="currency" className="w-48"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="BRL">BRL — Real (R$)</SelectItem>
                        <SelectItem value="USD">USD — Dólar ($)</SelectItem>
                        <SelectItem value="EUR">EUR — Euro (€)</SelectItem>
                        <SelectItem value="GBP">GBP — Libra (£)</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">Moeda usada na exibição de valores em todo o app.</p>
                  </Field>
                  <Field>
                    <FieldLabel>Plano atual</FieldLabel>
                    <Input
                      value={
                        company?.plan
                          ? company.plan.charAt(0).toUpperCase() + company.plan.slice(1)
                          : ''
                      }
                      disabled
                      aria-label="Plano atual (não editável)"
                      className="bg-muted/50 text-muted-foreground cursor-not-allowed"
                    />
                  </Field>
                </FieldGroup>
              </CardContent>
              <CardFooter className="border-t pt-6">
                <Button
                  onClick={handleSaveCompany}
                  disabled={isSavingCompany || !companyData.name.trim()}
                  aria-busy={isSavingCompany}
                >
                  {isSavingCompany && (
                    <Spinner className="mr-2 h-4 w-4" aria-hidden="true" />
                  )}
                  Salvar alterações
                </Button>
              </CardFooter>
            </Card>

            {/* Sandbox — dados demo */}
            <Card className="mt-6 rounded-2xl border border-border bg-card shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 font-[family-name:var(--font-display)] text-lg font-bold tracking-[-0.02em]">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent">
                    <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
                  </span>
                  Ambiente de teste (sandbox)
                  {company?.isSandbox && <Badge className="ml-1 rounded-full border-0 bg-warning/10 text-warning text-xs">Sandbox</Badge>}
                </CardTitle>
                <CardDescription>
                  Gere dados de exemplo para explorar o Radar sem fazer upload. Substitui os insights atuais por uma base demo.
                </CardDescription>
              </CardHeader>
              <CardFooter className="border-t pt-6">
                <Button variant="outline" onClick={handleSeedDemo} disabled={isSeeding} aria-busy={isSeeding}>
                  {isSeeding ? <Spinner className="mr-2 h-4 w-4" /> : <Sparkles className="mr-2 h-4 w-4" />}
                  Gerar dados demo
                </Button>
              </CardFooter>
            </Card>
          </TabsContent>}

          {/* Aba Notificações — admin e analista (digest por usuário) */}
          {canManageNotif && <TabsContent value="notifications">
            <Card className="rounded-2xl border border-border bg-card shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 font-[family-name:var(--font-display)] text-lg font-bold tracking-[-0.02em]">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent">
                    <Bell className="h-4 w-4 text-primary" aria-hidden="true" />
                  </span>
                  Notificações diárias
                </CardTitle>
                <CardDescription>
                  Receba um resumo de oportunidades todo dia às {notifPrefs.sendHour}h (horário de Brasília)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between gap-4 rounded-xl border border-border p-4">
                  <div>
                    <p className="text-sm font-medium text-foreground">Ativar notificações</p>
                    <p className="text-xs text-muted-foreground">Habilita o envio do resumo diário</p>
                  </div>
                  <Switch
                    checked={notifPrefs.enabled}
                    onCheckedChange={(v) => setNotifPrefs((p) => ({ ...p, enabled: v }))}
                  />
                </div>

                <div className="flex items-center justify-between gap-4 rounded-xl border border-border p-4">
                  <div>
                    <p className="text-sm font-medium text-foreground">Email</p>
                    <p className="text-xs text-muted-foreground">Enviar para {user?.email}</p>
                  </div>
                  <Switch
                    checked={notifPrefs.emailEnabled}
                    disabled={!notifPrefs.enabled}
                    onCheckedChange={(v) => setNotifPrefs((p) => ({ ...p, emailEnabled: v }))}
                  />
                </div>

                <div className="flex items-center justify-between gap-4 rounded-xl border border-border p-4">
                  <div>
                    <p className="text-sm font-medium text-foreground">WhatsApp</p>
                    <p className="text-xs text-muted-foreground">Requer WhatsApp Cloud API configurado</p>
                  </div>
                  <Switch
                    checked={notifPrefs.whatsappEnabled}
                    disabled={!notifPrefs.enabled}
                    onCheckedChange={(v) => setNotifPrefs((p) => ({ ...p, whatsappEnabled: v }))}
                  />
                </div>

                {notifPrefs.whatsappEnabled && (
                  <Field>
                    <FieldLabel htmlFor="whatsapp-phone">Número WhatsApp</FieldLabel>
                    <Input
                      id="whatsapp-phone"
                      placeholder="+55 11 99999-9999"
                      value={notifPrefs.whatsappPhone ?? ''}
                      onChange={(e) =>
                        setNotifPrefs((p) => ({ ...p, whatsappPhone: e.target.value }))
                      }
                      disabled={!notifPrefs.enabled}
                    />
                  </Field>
                )}

                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="send-hour">Hora de envio (BRT)</FieldLabel>
                    <Input
                      id="send-hour"
                      type="number"
                      min={0}
                      max={23}
                      value={notifPrefs.sendHour}
                      onChange={(e) =>
                        setNotifPrefs((p) => ({ ...p, sendHour: Number(e.target.value) }))
                      }
                      disabled={!notifPrefs.enabled}
                      className="w-24"
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="min-value">Valor mínimo de oportunidade (R$)</FieldLabel>
                    <Input
                      id="min-value"
                      type="number"
                      min={0}
                      step={100}
                      value={notifPrefs.minOpportunityValue}
                      onChange={(e) =>
                        setNotifPrefs((p) => ({ ...p, minOpportunityValue: Number(e.target.value) }))
                      }
                      disabled={!notifPrefs.enabled}
                      className="w-40"
                    />
                  </Field>
                </FieldGroup>
              </CardContent>
              <CardFooter className="border-t pt-6 gap-3">
                <Button onClick={handleSaveNotifications} disabled={isSavingNotif} aria-busy={isSavingNotif}>
                  {isSavingNotif && <Spinner className="mr-2 h-4 w-4" aria-hidden="true" />}
                  Salvar preferências
                </Button>
                <Button
                  variant="outline"
                  onClick={handleTestSend}
                  disabled={isSendingTest || !notifPrefs.enabled}
                  aria-busy={isSendingTest}
                >
                  {isSendingTest ? (
                    <Spinner className="mr-2 h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Send className="mr-2 h-4 w-4" aria-hidden="true" />
                  )}
                  Enviar teste
                </Button>
              </CardFooter>
            </Card>


            {/* Relatórios Agendados — admin only */}
            {isAdmin && (
              <Card className="rounded-2xl border border-border bg-card shadow-sm">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2 font-[family-name:var(--font-display)] text-lg font-bold tracking-[-0.02em]">
                        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent">
                          <Calendar className="h-4 w-4 text-primary" />
                        </span>
                        Relatórios automáticos
                      </CardTitle>
                      <CardDescription>Envie o relatório Excel automaticamente por email em uma frequência definida.</CardDescription>
                    </div>
                    <Button size="sm" variant="outline" className="gap-1 shrink-0" onClick={() => setScheduleDialog(true)}>
                      <Plus className="h-4 w-4" />
                      Agendar
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {schedules.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-2 text-center">Nenhum relatório agendado. Clique em "Agendar" para criar.</p>
                  ) : (
                    <div className="space-y-2">
                      {schedules.map(s => {
                        const freqLabel = s.frequency === 'weekly' ? `Semanal (${['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'][s.dayOfWeek ?? 0]})` : 'Mensal (dia 1)'
                        return (
                          <div key={s.id} className="flex items-center justify-between rounded-xl border border-border bg-secondary/30 px-4 py-3">
                            <div>
                              <p className="text-sm font-medium text-foreground">{freqLabel} · {s.dateRange}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">{(s.recipients ?? []).join(', ')}</p>
                            </div>
                            <button onClick={() => handleDeleteSchedule(s.id)} className="text-muted-foreground hover:text-destructive transition-colors ml-3 shrink-0">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>}

          {/* Aba Papéis & Permissões — admin only */}
          {isAdmin && <TabsContent value="rbac">
            <RbacTab />
          </TabsContent>}

          {/* Aba SSO — admin only */}
          {isAdmin && <TabsContent value="sso">
            <SSOTab />
          </TabsContent>}

          {/* Aba Compliance (auditoria + LGPD) — admin only */}
          {isAdmin && <TabsContent value="audit">
            <ComplianceTab />
          </TabsContent>}

          {/* Aba Plano — admin only */}
          {isAdmin && <TabsContent value="billing" className="space-y-6">
            <UsageCard />
            <Card className="rounded-2xl border border-border bg-card shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 font-[family-name:var(--font-display)] text-lg font-bold tracking-[-0.02em]">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent">
                    <CreditCard className="h-4 w-4 text-primary" aria-hidden="true" />
                  </span>
                  Plano e faturamento
                </CardTitle>
                <CardDescription>
                  Resumo do plano — upgrades e cobrança ficam na página de faturamento
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-primary bg-accent/40 p-5">
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground">
                      Plano{' '}
                      {company?.plan
                        ? company.plan.charAt(0).toUpperCase() + company.plan.slice(1)
                        : '—'}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      <span className="tabular-nums">{company?.uploadsUsed ?? 0}</span> de{' '}
                      <span className="tabular-nums">{company?.uploadsLimit ?? 0}</span> uploads
                      utilizados este mês
                    </p>
                  </div>
                  <Button
                    size="sm"
                    className="shrink-0"
                    onClick={() => router.push('/dashboard/billing')}
                  >
                    Gerenciar plano e faturamento
                  </Button>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  Upgrades, downgrades e detalhes de cobrança ficam na página de faturamento.
                </p>
              </CardContent>
            </Card>
          </TabsContent>}
        </Tabs>
      </div>
    </div>
    </>
  )
}
