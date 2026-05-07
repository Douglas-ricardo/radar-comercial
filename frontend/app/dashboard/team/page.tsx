//app/dashboard/team/page.tsx
'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { DashboardHeader } from '@/components/dashboard/header'
import { useAuth } from '@/lib/auth/auth-context'
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
  status: MemberStatus
  joinedAt: string | null
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const roleConfig: Record<string, { label: string; description: string; color: string }> = {
  admin: {
    label: 'Administrador',
    description: 'Acesso total a todas as funcionalidades',
    color: 'bg-primary/10 text-primary',
  },
  analyst: {
    label: 'Analista',
    description: 'Pode fazer uploads e visualizar insights',
    color: 'bg-chart-2/10 text-chart-2',
  },
  viewer: {
    label: 'Visualizador',
    description: 'Apenas visualizacao de dados',
    color: 'bg-muted text-muted-foreground',
  },
}

export default function TeamPage() {
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
  const [isInviting, setIsInviting] = useState(false)

  const [removeDialogOpen, setRemoveDialogOpen] = useState(false)
  const [memberToRemove, setMemberToRemove] = useState<DisplayMember | null>(null)

  // Diálogo "Alterar função"
  const [roleDialogOpen, setRoleDialogOpen] = useState(false)
  const [memberToUpdateRole, setMemberToUpdateRole] = useState<DisplayMember | null>(null)
  const [newRole, setNewRole] = useState<MemberRole>('analyst')
  const [isUpdatingRole, setIsUpdatingRole] = useState(false)

  const isValidInviteEmail = EMAIL_REGEX.test(inviteEmail.trim())

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
      const response = await api.team.invite(company.id, inviteEmail.trim(), inviteRole)
      if (response.success) {
        toast.success('Convite enviado com sucesso!')
        setInviteDialogOpen(false)
        setInviteEmail('')
        setInviteRole('analyst')
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

      <div className="flex-1 space-y-6 p-6">
        {/* Stats */}
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total de membros
              </CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {members.filter(m => m.status === 'active').length}
              </div>
              <p className="text-xs text-muted-foreground">
                {members.filter(m => m.status === 'pending').length} convites pendentes
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Administradores
              </CardTitle>
              <Shield className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {members.filter(m => m.role === 'admin' && m.status === 'active').length}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Analistas
              </CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {members.filter(m => m.role === 'analyst' && m.status === 'active').length}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Team Members */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Membros da equipe</CardTitle>
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
                        router.push('/dashboard/settings')
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
                        <FieldLabel htmlFor="role">Funcao</FieldLabel>
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
            <div className="space-y-4">
              {members.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between rounded-lg border border-border p-4"
                >
                  <div className="flex items-center gap-4">
                    <Avatar className="h-12 w-12">
                      <AvatarFallback className="bg-primary/10 text-primary">
                        {getInitials(member.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{member.name}</p>
                        {isCurrentUser(member.email) && (
                          <Badge variant="secondary" className="text-xs">Voce</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">{member.email}</p>
                      {member.status === 'pending' && (
                        <p className="flex items-center gap-1 text-xs text-warning">
                          <Clock className="h-3 w-3" />
                          Convite pendente
                        </p>
                      )}
                      {member.joinedAt && (
                        <p className="flex items-center gap-1 text-xs text-muted-foreground">
                          <CheckCircle className="h-3 w-3" />
                          Membro desde {new Date(member.joinedAt).toLocaleDateString('pt-BR')}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <Badge className={cn(roleConfig[member.role]?.color || roleConfig.viewer.color)}>
                      {roleConfig[member.role]?.label || 'Membro'}
                    </Badge>

                    {!isCurrentUser(member.email) && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">Acoes</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openRoleDialog(member)}>
                            <Shield className="mr-2 h-4 w-4" />
                            Alterar funcao
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
          </CardContent>
        </Card>

        {/* Role Permissions */}
        <Card>
          <CardHeader>
            <CardTitle>Permissoes por funcao</CardTitle>
            <CardDescription>
              Entenda o que cada funcao pode fazer no sistema
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-3">
              {Object.entries(roleConfig).map(([key, config]) => (
                <div key={key} className="rounded-lg border border-border p-4">
                  <Badge className={cn('mb-3', config.color)}>{config.label}</Badge>
                  <p className="text-sm text-muted-foreground">{config.description}</p>
                  <ul className="mt-3 space-y-1 text-sm">
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