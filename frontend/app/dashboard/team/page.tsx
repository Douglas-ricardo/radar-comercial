//app/dashboard/team/page.tsx
'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { DashboardHeader } from '@/components/dashboard/header'
import { useAuth } from '@/lib/auth/auth-context'
import { ProtectedRoute } from '@/lib/auth/protected-route'
import { api } from '@/lib/api/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Spinner } from '@/components/ui/spinner'
import {
  UserPlus,
  MoreHorizontal,
  Mail,
  Shield,
  Trash2,
  Clock,
  CheckCircle,
  Users,
  Crown,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TeamMember } from '@/types'

type MemberRole = TeamMember['role']
type MemberStatus = TeamMember['status']

interface DisplayMember {
  id: string
  name: string
  email: string
  role: MemberRole
  scope?: string | null
  status: MemberStatus
  joinedAt: string | null
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const roleConfig: Record<string, { label: string; description: string; color: string }> = {
  admin: {
    label: 'Administrador',
    description: 'Acesso total a todas as funcionalidades',
    color: 'border-transparent bg-primary/10 text-primary',
  },
  analyst: {
    label: 'Analista',
    description: 'Pode fazer uploads e visualizar insights',
    color: 'border-transparent bg-chart-2/10 text-chart-2',
  },
  viewer: {
    label: 'Visualizador',
    description: 'Apenas visualizacao de dados',
    color: 'border-transparent bg-muted text-muted-foreground',
  },
}

function TeamPageContent() {
  const { user, company } = useAuth()
  const router = useRouter()
  
  // Verifica se está no plano gratuito
  const isFreePlan = company?.plan === 'free' || !company?.plan
  
  // Estados Reais — tipagem forte para evitar erros silenciosos de contrato.
  const [members, setMembers] = useState<DisplayMember[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Estados da UI
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<MemberRole>('analyst')
  const [inviteScope, setInviteScope] = useState('')
  const [inviteRoleId, setInviteRoleId] = useState('')
  const [inviteOrgUnitId, setInviteOrgUnitId] = useState('')
  const [customRoles, setCustomRoles] = useState<{ id: string; name: string }[]>([])
  const [orgUnits, setOrgUnits] = useState<{ id: string; name: string; type: string }[]>([])
  const [isInviting, setIsInviting] = useState(false)

  const [removeDialogOpen, setRemoveDialogOpen] = useState(false)
  const [memberToRemove, setMemberToRemove] = useState<DisplayMember | null>(null)

  // Diálogo "Alterar função"
  const [roleDialogOpen, setRoleDialogOpen] = useState(false)
  const [memberToUpdateRole, setMemberToUpdateRole] = useState<DisplayMember | null>(null)
  const [newRole, setNewRole] = useState<MemberRole>('analyst')
  const [isUpdatingRole, setIsUpdatingRole] = useState(false)

  const isValidInviteEmail = EMAIL_REGEX.test(inviteEmail.trim())

  // Carrega papéis customizados e unidades organizacionais (para o convite)
  useEffect(() => {
    api.roles.list().then(r => { if (r.success && r.data) setCustomRoles(r.data.roles.map(x => ({ id: x.id, name: x.name }))) })
    api.orgUnits.list().then(r => { if (r.success && r.data) setOrgUnits(r.data.map(x => ({ id: x.id, name: x.name, type: x.type }))) })
  }, [])

  // Carrega os membros reais da API
  const loadMembers = useCallback(async () => {
    if (!company?.id) return
    setIsLoading(true)
    try {
      const response = await api.team.list(company.id)
      if (response.success && Array.isArray(response.data)) {
        // Backend retorna TeamMember[] — formata para o shape da UI.
        const formatted: DisplayMember[] = response.data.map((m) => ({
          id: m.id,
          name: m.name || m.email || 'Usuário Convidado',
          email: m.email,
          role: m.role,
          scope: m.scope,
          status: m.status,
          joinedAt: m.createdAt ?? null,
        }))
        setMembers(formatted)
      } else if (user) {
        setMembers([{
          id: 'owner',
          name: user.name,
          email: user.email,
          role: 'admin',
          status: 'active',
          joinedAt: new Date().toISOString(),
        }])
      }
    } catch (error) {
      console.error('Erro ao carregar equipe:', error)
      toast.error('Não foi possível carregar a equipe.')
      if (user) {
        setMembers([{
          id: 'owner',
          name: user.name,
          email: user.email,
          role: 'admin',
          status: 'active',
          joinedAt: new Date().toISOString(),
        }])
      }
    } finally {
      setIsLoading(false)
    }
  }, [company?.id, user])

  // Depende apenas do ID — evita re-render quando o objeto company é recriado.
  useEffect(() => {
    loadMembers()
  }, [loadMembers])

  const getInitials = (name: string) => {
    if (!name) return 'U'
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  const handleInvite = async () => {
    if (!company?.id) return
    if (!isValidInviteEmail) {
      toast.error('Email inválido.')
      return
    }
    setIsInviting(true)
    try {
      const scope = inviteScope.trim() || null
      const response = await api.team.invite(company.id, inviteEmail.trim(), inviteRole, scope, {
        roleId: inviteRoleId || null,
        orgUnitId: inviteOrgUnitId || null,
      })
      if (response.success) {
        toast.success('Convite enviado com sucesso!')
        setInviteDialogOpen(false)
        setInviteEmail('')
        setInviteRole('analyst')
        setInviteScope('')
        setInviteRoleId('')
        setInviteOrgUnitId('')
        loadMembers()
      } else {
        toast.error(response.error ?? 'Não foi possível enviar o convite.')
      }
    } catch (error) {
      console.error('Erro ao convidar membro:', error)
      toast.error('Erro de conexão. Tente novamente.')
    } finally {
      setIsInviting(false)
    }
  }

  const handleRemove = async () => {
    if (!memberToRemove?.id) return
    try {
      const response = await api.team.remove(memberToRemove.id)
      if (response.success) {
        toast.success('Membro removido com sucesso.')
        setRemoveDialogOpen(false)
        setMemberToRemove(null)
        loadMembers()
      } else {
        toast.error(response.error ?? 'Não foi possível remover o membro.')
      }
    } catch (error) {
      console.error('Erro ao remover membro:', error)
      toast.error('Erro de conexão. Tente novamente.')
    }
  }

  const handleResendInvite = async (memberId: string) => {
    try {
      const response = await api.team.resendInvite(memberId)
      if (response.success) {
        toast.success('Convite reenviado.')
      } else {
        toast.error(response.error ?? 'Não foi possível reenviar o convite.')
      }
    } catch (error) {
      console.error('Erro ao reenviar convite:', error)
      toast.error('Erro de conexão. Tente novamente.')
    }
  }

  const openRoleDialog = (member: DisplayMember) => {
    setMemberToUpdateRole(member)
    setNewRole(member.role)
    setRoleDialogOpen(true)
  }

  const handleUpdateRole = async () => {
    if (!memberToUpdateRole) return
    if (newRole === memberToUpdateRole.role) {
      setRoleDialogOpen(false)
      return
    }
    setIsUpdatingRole(true)
    try {
      const response = await api.team.updateRole(memberToUpdateRole.id, newRole)
      if (response.success) {
        toast.success(`Função alterada para ${roleConfig[newRole].label}.`)
        setRoleDialogOpen(false)
        setMemberToUpdateRole(null)
        loadMembers()
      } else {
        toast.error(response.error ?? 'Não foi possível alterar a função.')
      }
    } catch (error) {
      console.error('Erro ao alterar função:', error)
      toast.error('Erro de conexão. Tente novamente.')
    } finally {
      setIsUpdatingRole(false)
    }
  }

  const isCurrentUser = (email: string) => user?.email === email

  return (
    <div className="flex flex-col">
      <DashboardHeader
        title="Equipe"
        description="Gerencie os membros da sua equipe e suas permissoes"
      />

      <div className="flex-1 space-y-6 p-6 lg:p-8 max-w-[1200px] mx-auto w-full">
        {/* Stats */}
        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="rounded-2xl border border-border bg-card shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total de membros
              </CardTitle>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent">
                <Users className="h-4 w-4 text-primary" aria-hidden="true" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="font-[family-name:var(--font-display)] text-3xl font-bold tracking-[-0.02em] tabular-nums">
                {members.filter(m => m.status === 'active').length}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {members.filter(m => m.status === 'pending').length} convites pendentes
              </p>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border border-border bg-card shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Administradores
              </CardTitle>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent">
                <Shield className="h-4 w-4 text-primary" aria-hidden="true" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="font-[family-name:var(--font-display)] text-3xl font-bold tracking-[-0.02em] tabular-nums">
                {members.filter(m => m.role === 'admin' && m.status === 'active').length}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Acesso total à conta</p>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border border-border bg-card shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Analistas
              </CardTitle>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent">
                <Users className="h-4 w-4 text-primary" aria-hidden="true" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="font-[family-name:var(--font-display)] text-3xl font-bold tracking-[-0.02em] tabular-nums">
                {members.filter(m => m.role === 'analyst' && m.status === 'active').length}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Operam uploads e insights</p>
            </CardContent>
          </Card>
        </div>

        {/* Team Members */}
        <Card className="rounded-2xl border border-border bg-card shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <div className="space-y-1">
              <CardTitle className="font-[family-name:var(--font-display)] text-lg font-bold tracking-[-0.02em]">Membros da equipe</CardTitle>
              <CardDescription>
                Gerencie quem tem acesso ao Radar Comercial da sua empresa
              </CardDescription>
            </div>
            <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <UserPlus className="mr-2 h-4 w-4" />
                  Convidar membro
                </Button>
              </DialogTrigger>
              
              <DialogContent>
                {/* LÓGICA DE BLOQUEIO NO FRONTEND BASEADA NO PLANO */}
                {isFreePlan ? (
                  <>
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2">
                        <Crown className="h-5 w-5 text-primary" />
                        Upgrade Necessário
                      </DialogTitle>
                      <DialogDescription className="pt-2 text-base">
                        O plano <strong>Gratuito</strong> permite apenas 1 membro por conta (você). 
                        Para convidar a sua equipe e colaborar no Radar Comercial, faça o upgrade para o plano Profissional.
                      </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="pt-4">
                      <Button variant="outline" onClick={() => setInviteDialogOpen(false)}>
                        Cancelar
                      </Button>
                      <Button onClick={() => {
                        setInviteDialogOpen(false)
                        router.push('/dashboard/billing')
                      }}>
                        Ver Planos
                      </Button>
                    </DialogFooter>
                  </>
                ) : (
                  <>
                    <DialogHeader>
                      <DialogTitle>Convidar novo membro</DialogTitle>
                      <DialogDescription>
                        Envie um convite por email para adicionar um novo membro a sua equipe
                      </DialogDescription>
                    </DialogHeader>
                    <FieldGroup className="py-4">
                      <Field>
                        <FieldLabel htmlFor="email">Email</FieldLabel>
                        <Input
                          id="email"
                          type="email"
                          placeholder="email@empresa.com"
                          value={inviteEmail}
                          onChange={(e) => setInviteEmail(e.target.value)}
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="role">Função</FieldLabel>
                        <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as typeof inviteRole)}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(roleConfig).map(([key, config]) => (
                              <SelectItem key={key} value={key}>
                                <div>
                                  <span className="font-medium">{config.label}</span>
                                  <span className="ml-2 text-xs text-muted-foreground">
                                    - {config.description}
                                  </span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                      {customRoles.length > 0 && (
                        <Field>
                          <FieldLabel htmlFor="custom-role">Papel customizado <span className="text-muted-foreground font-normal">(opcional)</span></FieldLabel>
                          <Select value={inviteRoleId || 'none'} onValueChange={(v) => setInviteRoleId(v === 'none' ? '' : v)}>
                            <SelectTrigger id="custom-role"><SelectValue placeholder="Usar papel padrão" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Usar papel padrão</SelectItem>
                              {customRoles.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </Field>
                      )}
                      {orgUnits.length > 0 && (
                        <Field>
                          <FieldLabel htmlFor="org-unit">Unidade organizacional <span className="text-muted-foreground font-normal">(opcional)</span></FieldLabel>
                          <Select value={inviteOrgUnitId || 'none'} onValueChange={(v) => setInviteOrgUnitId(v === 'none' ? '' : v)}>
                            <SelectTrigger id="org-unit"><SelectValue placeholder="Sem restrição" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Sem restrição</SelectItem>
                              {orgUnits.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </Field>
                      )}
                      <Field>
                        <FieldLabel htmlFor="scope">Escopo territorial (legado) <span className="text-muted-foreground font-normal">(opcional)</span></FieldLabel>
                        <Input
                          id="scope"
                          type="text"
                          placeholder="ex: branch:SP-001"
                          value={inviteScope}
                          onChange={(e) => setInviteScope(e.target.value)}
                        />
                      </Field>
                    </FieldGroup>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setInviteDialogOpen(false)}>
                        Cancelar
                      </Button>
                      <Button onClick={handleInvite} disabled={!isValidInviteEmail || isInviting}>
                        {isInviting ? (
                          <>
                            <Spinner className="mr-2 h-4 w-4" />
                            Enviando...
                          </>
                        ) : (
                          <>
                            <Mail className="mr-2 h-4 w-4" />
                            Enviar convite
                          </>
                        )}
                      </Button>
                    </DialogFooter>
                  </>
                )}
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
                <Spinner className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
                <p className="text-sm text-muted-foreground">Carregando equipe...</p>
              </div>
            ) : members.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-14 text-center">
                <div className="mb-1 flex h-12 w-12 items-center justify-center rounded-full bg-accent">
                  <Users className="h-6 w-6 text-primary" aria-hidden="true" />
                </div>
                <p className="text-sm font-medium text-foreground">Nenhum membro ainda</p>
                <p className="max-w-xs text-sm text-muted-foreground">
                  Convide seu time para colaborar nas oportunidades do Radar Comercial.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {members.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between gap-4 rounded-xl border border-border p-4 transition-colors hover:bg-accent/40"
                  >
                    <div className="flex min-w-0 items-center gap-4">
                      <Avatar className="h-11 w-11 shrink-0">
                        <AvatarFallback className="bg-accent text-sm font-semibold text-primary">
                          {getInitials(member.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="truncate font-medium text-foreground">{member.name}</p>
                          {isCurrentUser(member.email) && (
                            <Badge variant="secondary" className="rounded-full text-xs">Você</Badge>
                          )}
                        </div>
                        <p className="truncate text-sm text-muted-foreground">{member.email}</p>
                        {member.status === 'pending' && (
                          <p className="mt-0.5 flex items-center gap-1 text-xs font-medium text-warning">
                            <Clock className="h-3 w-3" aria-hidden="true" />
                            Convite pendente
                          </p>
                        )}
                        {member.status !== 'pending' && member.joinedAt && (
                          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                            <CheckCircle className="h-3 w-3" aria-hidden="true" />
                            Membro desde {new Date(member.joinedAt).toLocaleDateString('pt-BR')}
                          </p>
                        )}
                        {member.scope && (
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            Escopo: <span className="font-mono">{member.scope}</span>
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-3">
                      <Badge className={cn('rounded-full', roleConfig[member.role]?.color || roleConfig.viewer.color)}>
                        {roleConfig[member.role]?.label || 'Membro'}
                      </Badge>

                      {!isCurrentUser(member.email) && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
                              <MoreHorizontal className="h-4 w-4" />
                              <span className="sr-only">Ações</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openRoleDialog(member)}>
                              <Shield className="mr-2 h-4 w-4" />
                              Alterar função
                            </DropdownMenuItem>
                            {member.status === 'pending' && (
                              <DropdownMenuItem onClick={() => handleResendInvite(member.id)}>
                                <Mail className="mr-2 h-4 w-4" />
                                Reenviar convite
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => {
                                setMemberToRemove(member)
                                setRemoveDialogOpen(true)
                              }}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Remover
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Role Permissions */}
        <Card className="rounded-2xl border border-border bg-card shadow-sm">
          <CardHeader>
            <CardTitle className="font-[family-name:var(--font-display)] text-lg font-bold tracking-[-0.02em]">Permissões por função</CardTitle>
            <CardDescription>
              Entenda o que cada função pode fazer no sistema
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-3">
              {Object.entries(roleConfig).map(([key, config]) => (
                <div key={key} className="rounded-xl border border-border bg-background p-4">
                  <Badge className={cn('mb-3 rounded-full', config.color)}>{config.label}</Badge>
                  <p className="text-sm text-muted-foreground">{config.description}</p>
                  <ul className="mt-3 space-y-1.5 text-sm">
                    {key === 'admin' && (
                      <>
                        <li className="flex items-center gap-2">
                          <CheckCircle className="h-3 w-3 text-success" />
                          Gerenciar equipe
                        </li>
                        <li className="flex items-center gap-2">
                          <CheckCircle className="h-3 w-3 text-success" />
                          Configuracoes da empresa
                        </li>
                        <li className="flex items-center gap-2">
                          <CheckCircle className="h-3 w-3 text-success" />
                          Fazer uploads
                        </li>
                        <li className="flex items-center gap-2">
                          <CheckCircle className="h-3 w-3 text-success" />
                          Ver todos os insights
                        </li>
                      </>
                    )}
                    {key === 'analyst' && (
                      <>
                        <li className="flex items-center gap-2">
                          <CheckCircle className="h-3 w-3 text-success" />
                          Fazer uploads
                        </li>
                        <li className="flex items-center gap-2">
                          <CheckCircle className="h-3 w-3 text-success" />
                          Ver todos os insights
                        </li>
                        <li className="flex items-center gap-2">
                          <CheckCircle className="h-3 w-3 text-success" />
                          Exportar relatorios
                        </li>
                      </>
                    )}
                    {key === 'viewer' && (
                      <>
                        <li className="flex items-center gap-2">
                          <CheckCircle className="h-3 w-3 text-success" />
                          Ver insights
                        </li>
                        <li className="flex items-center gap-2">
                          <CheckCircle className="h-3 w-3 text-success" />
                          Ver historico
                        </li>
                      </>
                    )}
                  </ul>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Alterar função */}
        <Dialog open={roleDialogOpen} onOpenChange={setRoleDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Alterar função</DialogTitle>
              <DialogDescription>
                {memberToUpdateRole
                  ? `Defina a nova função de ${memberToUpdateRole.name}.`
                  : 'Escolha a nova função.'}
              </DialogDescription>
            </DialogHeader>
            <FieldGroup className="py-4">
              <Field>
                <FieldLabel htmlFor="new-role">Função</FieldLabel>
                <Select value={newRole} onValueChange={(v) => setNewRole(v as MemberRole)}>
                  <SelectTrigger id="new-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(roleConfig).map(([key, config]) => (
                      <SelectItem key={key} value={key}>
                        <div>
                          <span className="font-medium">{config.label}</span>
                          <span className="ml-2 text-xs text-muted-foreground">
                            - {config.description}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setRoleDialogOpen(false)}
                disabled={isUpdatingRole}
              >
                Cancelar
              </Button>
              <Button onClick={handleUpdateRole} disabled={isUpdatingRole}>
                {isUpdatingRole && <Spinner className="mr-2 h-4 w-4" />}
                Confirmar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Remove Member Dialog */}
        <Dialog open={removeDialogOpen} onOpenChange={setRemoveDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Remover membro</DialogTitle>
              <DialogDescription>
                Tem certeza que deseja remover {memberToRemove?.name} da equipe?
                Esta pessoa perdera acesso ao Radar Comercial.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRemoveDialogOpen(false)}>
                Cancelar
              </Button>
              <Button variant="destructive" onClick={handleRemove}>
                Remover
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}

export default function TeamPage() {
  return (
    <ProtectedRoute requiredRoles={['admin']}>
      <TeamPageContent />
    </ProtectedRoute>
  )
}