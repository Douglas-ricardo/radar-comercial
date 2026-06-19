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
import { Building2, User, CreditCard, Lock, Bell, Send } from 'lucide-react'
import { api } from '@/lib/api/client'
import { toast } from 'sonner'
import type { NotificationPreference } from '@/types'

export default function SettingsPage() {
  const { user, company, updateUser, updateCompany } = useAuth()
  const router = useRouter()

  const [isSavingProfile, setIsSavingProfile] = useState(false)
  const [isSavingCompany, setIsSavingCompany] = useState(false)
  const [isChangingPassword, setIsChangingPassword] = useState(false)
  const [isSavingNotif, setIsSavingNotif] = useState(false)
  const [isSendingTest, setIsSendingTest] = useState(false)
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
  }, [])

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

  // Persiste dados da empresa no backend e atualiza contexto local
  const handleSaveCompany = async () => {
    if (!company?.id) return
    setIsSavingCompany(true)
    try {
      const response = await api.company.update(company.id, { name: companyData.name })
      if (response.success && response.data) {
        updateCompany({ name: response.data.name })
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

  return (
    <div className="flex flex-col">
      <DashboardHeader
        title="Configurações"
        description="Gerencie sua conta e preferências do Radar"
      />
      <div className="flex-1 p-6">
        <Tabs defaultValue="profile" className="space-y-6">
          <TabsList>
            <TabsTrigger value="profile" className="gap-2">
              <User className="h-4 w-4" aria-hidden="true" />
              Perfil
            </TabsTrigger>
            <TabsTrigger value="company" className="gap-2">
              <Building2 className="h-4 w-4" aria-hidden="true" />
              Empresa
            </TabsTrigger>
            <TabsTrigger value="notifications" className="gap-2">
              <Bell className="h-4 w-4" aria-hidden="true" />
              Notificações
            </TabsTrigger>
            <TabsTrigger value="billing" className="gap-2">
              <CreditCard className="h-4 w-4" aria-hidden="true" />
              Plano
            </TabsTrigger>
          </TabsList>

          {/* Aba Perfil */}
          <TabsContent value="profile">
            <Card>
              <CardHeader>
                <CardTitle className="font-serif text-lg font-medium tracking-[-0.01em]">Perfil pessoal</CardTitle>
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

            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 font-serif text-lg font-medium tracking-[-0.01em]">
                  <Lock className="h-4 w-4" aria-hidden="true" />
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
              <CardFooter className="border-t pt-6">
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

          {/* Aba Empresa */}
          <TabsContent value="company">
            <Card>
              <CardHeader>
                <CardTitle className="font-serif text-lg font-medium tracking-[-0.01em]">Dados da empresa</CardTitle>
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
          </TabsContent>

          {/* Aba Notificações */}
          <TabsContent value="notifications">
            <Card>
              <CardHeader>
                <CardTitle className="font-serif text-lg font-medium tracking-[-0.01em]">Notificações diárias</CardTitle>
                <CardDescription>
                  Receba um resumo de oportunidades todo dia às {notifPrefs.sendHour}h (horário de Brasília)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">Ativar notificações</p>
                    <p className="text-xs text-muted-foreground">Habilita o envio do resumo diário</p>
                  </div>
                  <Switch
                    checked={notifPrefs.enabled}
                    onCheckedChange={(v) => setNotifPrefs((p) => ({ ...p, enabled: v }))}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">Email</p>
                    <p className="text-xs text-muted-foreground">Enviar para {user?.email}</p>
                  </div>
                  <Switch
                    checked={notifPrefs.emailEnabled}
                    disabled={!notifPrefs.enabled}
                    onCheckedChange={(v) => setNotifPrefs((p) => ({ ...p, emailEnabled: v }))}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">WhatsApp</p>
                    <p className="text-xs text-muted-foreground">Requer TWILIO configurado</p>
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
          </TabsContent>

          {/* Aba Plano */}
          <TabsContent value="billing">
            <Card>
              <CardHeader>
                <CardTitle className="font-serif text-lg font-medium tracking-[-0.01em]">Plano e faturamento</CardTitle>
                <CardDescription>
                  Gerencie sua assinatura e histórico de pagamentos
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg border border-border p-4 flex items-center justify-between">
                  <div>
                    <p className="font-medium">
                      Plano{' '}
                      {company?.plan
                        ? company.plan.charAt(0).toUpperCase() + company.plan.slice(1)
                        : '—'}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {company?.uploadsUsed ?? 0} de {company?.uploadsLimit ?? 0} uploads
                      utilizados este mês
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => router.push('/dashboard/billing')}
                  >
                    Gerenciar plano
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
