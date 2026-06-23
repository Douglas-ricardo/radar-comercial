'use client'

import { useState, useEffect, useCallback } from 'react'
import { api } from '@/lib/api/client'
import { useAuth } from '@/lib/auth/auth-context'
import { toast } from 'sonner'
import type { AuditEntry } from '@/types'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ShieldCheck, Download, Database, FileDown, Search } from 'lucide-react'

export function ComplianceTab() {
  const { company, updateCompany } = useAuth()
  const [logs, setLogs] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ action: '', dateFrom: '', dateTo: '' })

  const [retention, setRetention] = useState(String(company?.auditRetentionDays ?? 365))
  const [savingRetention, setSavingRetention] = useState(false)
  const [exporting, setExporting] = useState(false)

  const load = useCallback(async () => {
    if (!company?.id) return
    setLoading(true)
    const res = await api.audit.listLog(company.id, {
      limit: 100,
      action: filters.action || undefined,
      dateFrom: filters.dateFrom || undefined,
      dateTo: filters.dateTo || undefined,
    })
    if (res.success && res.data) setLogs(res.data)
    setLoading(false)
  }, [company?.id, filters])

  useEffect(() => { load() }, [load])

  function exportCsv() {
    if (!company?.id) return
    const url = api.audit.exportUrl(company.id, {
      action: filters.action || undefined,
      dateFrom: filters.dateFrom || undefined,
      dateTo: filters.dateTo || undefined,
    })
    window.open(url, '_blank')
  }

  async function saveRetention() {
    if (!company?.id) return
    const days = parseInt(retention)
    if (isNaN(days) || days < 30 || days > 3650) { toast.error('Use entre 30 e 3650 dias.'); return }
    setSavingRetention(true)
    const res = await api.company.update(company.id, { auditRetentionDays: days })
    setSavingRetention(false)
    if (res.success && res.data) {
      updateCompany({ auditRetentionDays: res.data.auditRetentionDays })
      toast.success('Política de retenção atualizada.')
    } else toast.error(res.error ?? 'Erro ao salvar.')
  }

  async function requestExport() {
    if (!company?.id) return
    setExporting(true)
    const res = await api.company.requestDataExport(company.id)
    setExporting(false)
    if (res.success) toast.success('Export em preparação — você receberá o link por e-mail.')
    else toast.error(res.error ?? 'Erro ao solicitar export.')
  }

  return (
    <div className="space-y-6">
      {/* Compliance center */}
      <Card className="rounded-2xl border border-border bg-card shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-[family-name:var(--font-display)] text-lg font-bold tracking-[-0.02em]">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent"><Database className="h-4 w-4 text-primary" /></span>
            Central de compliance (LGPD/GDPR)
          </CardTitle>
          <CardDescription>Retenção de auditoria, portabilidade de dados e sub-processadores.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="retention">Retenção de auditoria (dias)</Label>
              <Input id="retention" type="number" min={30} max={3650} value={retention}
                onChange={e => setRetention(e.target.value)} className="w-40" />
            </div>
            <Button variant="outline" onClick={saveRetention} disabled={savingRetention}>
              {savingRetention && <Spinner className="mr-2 h-4 w-4" />}Salvar retenção
            </Button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-secondary/20 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-foreground">Exportar todos os dados</p>
              <p className="text-xs text-muted-foreground">ZIP com empresa, usuários, insights, perfis, carteira, auditoria e configs. Link por e-mail (24h).</p>
            </div>
            <Button onClick={requestExport} disabled={exporting}>
              {exporting ? <Spinner className="mr-2 h-4 w-4" /> : <FileDown className="mr-2 h-4 w-4" />}Solicitar export
            </Button>
          </div>

          <div className="text-xs text-muted-foreground">
            <p className="font-medium text-foreground mb-1">Sub-processadores</p>
            <p>Neon (banco), Upstash (cache/filas), Stripe (pagamentos), Resend (e-mail), Cloudflare R2 (arquivos), Anthropic (IA). DPA disponível mediante solicitação.</p>
          </div>
        </CardContent>
      </Card>

      {/* Audit log */}
      <Card className="rounded-2xl border border-border bg-card shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 font-[family-name:var(--font-display)] text-lg font-bold tracking-[-0.02em]">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent"><ShieldCheck className="h-4 w-4 text-primary" /></span>
              Log de auditoria
            </CardTitle>
            <CardDescription>Ações relevantes da equipe. Filtre e exporte para CSV.</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={exportCsv}><Download className="h-4 w-4 mr-1" /> Exportar CSV</Button>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Ação</Label>
              <Input placeholder="ex: login, role" value={filters.action} onChange={e => setFilters(f => ({ ...f, action: e.target.value }))} className="w-44" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">De</Label>
              <Input type="date" value={filters.dateFrom} onChange={e => setFilters(f => ({ ...f, dateFrom: e.target.value }))} className="w-40" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Até</Label>
              <Input type="date" value={filters.dateTo} onChange={e => setFilters(f => ({ ...f, dateTo: e.target.value }))} className="w-40" />
            </div>
            <Button variant="secondary" size="sm" onClick={load}><Search className="h-4 w-4 mr-1" /> Filtrar</Button>
          </div>

          {loading ? (
            <div className="flex justify-center py-10"><Spinner /></div>
          ) : logs.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Nenhum registro encontrado.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Ação</TableHead>
                  <TableHead>Usuário</TableHead>
                  <TableHead>IP</TableHead>
                  <TableHead>Recurso</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map(l => (
                  <TableRow key={l.id}>
                    <TableCell className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">{l.createdAt ? new Date(l.createdAt).toLocaleString('pt-BR') : '—'}</TableCell>
                    <TableCell><Badge variant="outline" className="font-mono text-xs">{l.action}</Badge></TableCell>
                    <TableCell className="text-sm">{l.userName ?? l.userId ?? '—'}</TableCell>
                    <TableCell className="text-xs tabular-nums text-muted-foreground">{l.ip ?? '—'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{l.resourceType ?? '—'}{l.resourceId ? ` #${l.resourceId.slice(0, 8)}` : ''}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
