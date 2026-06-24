'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api/client'
import type { StatusData } from '@/types'
import { CheckCircle2, AlertTriangle, XCircle, Activity, RefreshCw } from 'lucide-react'

const SERVICE_LABELS: Record<string, string> = {
  api: 'API', database: 'Banco de dados', redis: 'Cache & filas (Redis)', worker: 'Processamento (Celery)',
}

const STATUS_META: Record<string, { label: string; color: string; Icon: typeof CheckCircle2 }> = {
  operational: { label: 'Operacional', color: 'text-emerald-600', Icon: CheckCircle2 },
  degraded: { label: 'Degradado', color: 'text-amber-600', Icon: AlertTriangle },
  down: { label: 'Indisponível', color: 'text-red-600', Icon: XCircle },
  outage: { label: 'Interrupção', color: 'text-red-600', Icon: XCircle },
}

export default function StatusPage() {
  const [data, setData] = useState<StatusData | null>(null)
  const [loading, setLoading] = useState(true)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)

  async function load() {
    setLoading(true)
    const res = await api.status.get()
    if (res.success && res.data) { setData(res.data); setUpdatedAt(new Date()) }
    setLoading(false)
  }

  useEffect(() => {
    load()
    const t = setInterval(load, 30000)
    return () => clearInterval(t)
  }, [])

  const overall = data ? (STATUS_META[data.overall] ?? STATUS_META.operational) : STATUS_META.operational

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-6 py-16">
        <div className="mb-8 flex items-center gap-2">
          <Activity className="h-6 w-6 text-primary" />
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-extrabold tracking-[-0.02em]">Status do Radar Comercial</h1>
        </div>

        <div className={`mb-8 flex items-center justify-between rounded-2xl border p-5 ${data?.overall === 'operational' ? 'border-emerald-200 bg-emerald-50' : data?.overall === 'degraded' ? 'border-amber-200 bg-amber-50' : 'border-red-200 bg-red-50'}`}>
          <div className="flex items-center gap-3">
            <overall.Icon className={`h-6 w-6 ${overall.color}`} />
            <div>
              <p className={`font-semibold ${overall.color}`}>{loading && !data ? 'Verificando…' : `Todos os sistemas: ${overall.label}`}</p>
              {updatedAt && <p className="text-xs text-muted-foreground">Atualizado {updatedAt.toLocaleTimeString('pt-BR')}</p>}
            </div>
          </div>
          <button onClick={load} className="rounded-lg p-2 text-muted-foreground hover:bg-background/60" aria-label="Atualizar">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="space-y-2">
          {data && Object.entries(data.services).map(([key, svc]) => {
            const meta = STATUS_META[svc.status] ?? STATUS_META.operational
            return (
              <div key={key} className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
                <span className="text-sm font-medium">{SERVICE_LABELS[key] ?? key}</span>
                <div className="flex items-center gap-2">
                  {svc.latencyMs !== undefined && <span className="text-xs tabular-nums text-muted-foreground">{svc.latencyMs}ms</span>}
                  {svc.workers !== undefined && <span className="text-xs tabular-nums text-muted-foreground">{svc.workers} worker(s)</span>}
                  <meta.Icon className={`h-4 w-4 ${meta.color}`} />
                  <span className={`text-sm ${meta.color}`}>{meta.label}</span>
                </div>
              </div>
            )
          })}
        </div>

        <p className="mt-8 text-center text-xs text-muted-foreground">Atualização automática a cada 30s.</p>
      </div>
    </div>
  )
}
