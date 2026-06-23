'use client'

import { useState, useEffect, useCallback } from 'react'
import { api } from '@/lib/api/client'
import { toast } from 'sonner'
import type { RolesData, CustomRole, OrgUnit, PermissionCatalogEntry } from '@/types'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Shield, Plus, Trash2, Pencil, Network, ChevronRight } from 'lucide-react'

const TYPE_LABELS: Record<string, string> = { region: 'Região', branch: 'Filial', team: 'Equipe' }

export function RbacTab() {
  const [data, setData] = useState<RolesData | null>(null)
  const [units, setUnits] = useState<OrgUnit[]>([])
  const [loading, setLoading] = useState(true)

  // role dialog
  const [roleOpen, setRoleOpen] = useState(false)
  const [editingRole, setEditingRole] = useState<CustomRole | null>(null)
  const [roleForm, setRoleForm] = useState<{ name: string; baseRole: string; permissions: string[] }>({ name: '', baseRole: 'viewer', permissions: [] })

  // unit dialog
  const [unitOpen, setUnitOpen] = useState(false)
  const [unitForm, setUnitForm] = useState<{ name: string; type: string; parentId: string }>({ name: '', type: 'branch', parentId: '' })

  const load = useCallback(async () => {
    setLoading(true)
    const [r, u] = await Promise.all([api.roles.list(), api.orgUnits.list()])
    if (r.success && r.data) setData(r.data)
    if (u.success && u.data) setUnits(u.data)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function openNewRole() {
    setEditingRole(null)
    setRoleForm({ name: '', baseRole: 'viewer', permissions: [] })
    setRoleOpen(true)
  }
  function openEditRole(r: CustomRole) {
    setEditingRole(r)
    setRoleForm({ name: r.name, baseRole: r.baseRole, permissions: [...r.permissions] })
    setRoleOpen(true)
  }
  function togglePerm(key: string) {
    setRoleForm(f => ({ ...f, permissions: f.permissions.includes(key) ? f.permissions.filter(p => p !== key) : [...f.permissions, key] }))
  }
  function applyPreset(preset: string) {
    if (data) setRoleForm(f => ({ ...f, baseRole: preset, permissions: [...(data.presets[preset] ?? [])] }))
  }
  async function saveRole() {
    if (!roleForm.name.trim()) return
    const res = editingRole
      ? await api.roles.update(editingRole.id, roleForm)
      : await api.roles.create(roleForm)
    if (res.success) { toast.success('Papel salvo.'); setRoleOpen(false); load() }
    else toast.error(res.error ?? 'Erro ao salvar papel.')
  }
  async function deleteRole(id: string) {
    const res = await api.roles.remove(id)
    if (res.success) { toast.success('Papel removido.'); load() }
    else toast.error(res.error ?? 'Erro.')
  }

  async function saveUnit() {
    if (!unitForm.name.trim()) return
    const res = await api.orgUnits.create({ name: unitForm.name, type: unitForm.type, parentId: unitForm.parentId || null })
    if (res.success) { toast.success('Unidade criada.'); setUnitOpen(false); setUnitForm({ name: '', type: 'branch', parentId: '' }); load() }
    else toast.error(res.error ?? 'Erro.')
  }
  async function deleteUnit(id: string) {
    const res = await api.orgUnits.remove(id)
    if (res.success) { toast.success('Unidade removida.'); load() }
    else toast.error(res.error ?? 'Erro.')
  }

  // Build tree depth for indentation
  const depthOf = (u: OrgUnit): number => {
    let d = 0, cur: OrgUnit | undefined = u
    while (cur?.parentId) { cur = units.find(x => x.id === cur!.parentId); d++; if (d > 6) break }
    return d
  }
  const sortedUnits = [...units].sort((a, b) => depthOf(a) - depthOf(b))

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>

  // group catalog by group
  const grouped: Record<string, PermissionCatalogEntry[]> = {}
  for (const e of data?.catalog ?? []) (grouped[e.group] ??= []).push(e)

  return (
    <div className="space-y-6">
      {/* Papéis */}
      <Card className="rounded-2xl border border-border bg-card shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 font-[family-name:var(--font-display)] text-lg font-bold tracking-[-0.02em]">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent"><Shield className="h-4 w-4 text-primary" /></span>
              Papéis & Permissões
            </CardTitle>
            <CardDescription>Crie papéis customizados com uma matriz de permissões por recurso.</CardDescription>
          </div>
          <Button size="sm" onClick={openNewRole}><Plus className="h-4 w-4 mr-1" /> Novo papel</Button>
        </CardHeader>
        <CardContent>
          {(data?.roles.length ?? 0) === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Nenhum papel customizado. Os papéis padrão (Admin, Analyst, Viewer) continuam disponíveis.
            </p>
          ) : (
            <div className="space-y-2">
              {data!.roles.map(r => (
                <div key={r.id} className="flex items-center justify-between rounded-xl border border-border px-4 py-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{r.name}</span>
                      <Badge variant="outline" className="text-xs">base: {r.baseRole}</Badge>
                      <span className="text-xs text-muted-foreground">{r.permissions.length} permissões</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEditRole(r)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => deleteRole(r.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Estrutura organizacional */}
      <Card className="rounded-2xl border border-border bg-card shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 font-[family-name:var(--font-display)] text-lg font-bold tracking-[-0.02em]">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent"><Network className="h-4 w-4 text-primary" /></span>
              Estrutura organizacional
            </CardTitle>
            <CardDescription>Regiões → filiais → equipes. Usuários atribuídos a uma unidade veem só a subárvore dela. Filiais com nome igual ao do CSV territorializam a carteira.</CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={() => setUnitOpen(true)}><Plus className="h-4 w-4 mr-1" /> Nova unidade</Button>
        </CardHeader>
        <CardContent>
          {units.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Nenhuma unidade. Crie regiões e filiais para territorializar o acesso.</p>
          ) : (
            <div className="space-y-1">
              {sortedUnits.map(u => (
                <div key={u.id} className="flex items-center justify-between rounded-lg px-2 py-2 hover:bg-secondary/30" style={{ paddingLeft: `${depthOf(u) * 20 + 8}px` }}>
                  <div className="flex items-center gap-2">
                    {u.parentId && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                    <span className="text-sm">{u.name}</span>
                    <Badge variant="outline" className="text-xs">{TYPE_LABELS[u.type] ?? u.type}</Badge>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => deleteUnit(u.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Role dialog */}
      <Dialog open={roleOpen} onOpenChange={setRoleOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-[family-name:var(--font-display)] font-bold tracking-[-0.02em]">{editingRole ? 'Editar papel' : 'Novo papel'}</DialogTitle>
            <DialogDescription>Defina o nome, o tier base (compat) e as permissões.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2 max-h-[60vh] overflow-y-auto">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Nome</Label>
                <Input placeholder="Ex: Gerente Regional" value={roleForm.name} onChange={e => setRoleForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Tier base (compat)</Label>
                <Select value={roleForm.baseRole} onValueChange={(v) => setRoleForm(f => ({ ...f, baseRole: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="viewer">Viewer</SelectItem>
                    <SelectItem value="analyst">Analyst</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">Começar de um preset:</span>
              {['viewer', 'analyst', 'admin'].map(p => (
                <button key={p} type="button" onClick={() => applyPreset(p)} className="rounded-full border border-border px-2 py-0.5 hover:bg-accent capitalize">{p}</button>
              ))}
            </div>
            <div className="space-y-3">
              {Object.entries(grouped).map(([group, entries]) => (
                <div key={group}>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group}</p>
                  <div className="space-y-1.5">
                    {entries.map(e => (
                      <label key={e.key} className="flex items-center gap-2 text-sm cursor-pointer">
                        <Checkbox checked={roleForm.permissions.includes(e.key)} onCheckedChange={() => togglePerm(e.key)} />
                        {e.label}
                        <code className="ml-auto text-[10px] text-muted-foreground">{e.key}</code>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoleOpen(false)}>Cancelar</Button>
            <Button onClick={saveRole} disabled={!roleForm.name.trim()}>Salvar papel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Unit dialog */}
      <Dialog open={unitOpen} onOpenChange={setUnitOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-[family-name:var(--font-display)] font-bold tracking-[-0.02em]">Nova unidade</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1">
              <Label>Nome {unitForm.type === 'branch' && <span className="text-xs text-muted-foreground">(igual ao branch no CSV)</span>}</Label>
              <Input placeholder="Ex: SP-001 ou Região Sul" value={unitForm.name} onChange={e => setUnitForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Tipo</Label>
                <Select value={unitForm.type} onValueChange={(v) => setUnitForm(f => ({ ...f, type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="region">Região</SelectItem>
                    <SelectItem value="branch">Filial</SelectItem>
                    <SelectItem value="team">Equipe</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Unidade pai</Label>
                <Select value={unitForm.parentId || 'none'} onValueChange={(v) => setUnitForm(f => ({ ...f, parentId: v === 'none' ? '' : v }))}>
                  <SelectTrigger><SelectValue placeholder="Raiz" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Raiz (sem pai)</SelectItem>
                    {units.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUnitOpen(false)}>Cancelar</Button>
            <Button onClick={saveUnit} disabled={!unitForm.name.trim()}>Criar unidade</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
