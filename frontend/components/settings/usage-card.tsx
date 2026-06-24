'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api/client'
import { useAuth } from '@/lib/auth/auth-context'
import type { UsageData } from '@/types'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { BarChart3 } from 'lucide-react'

const KIND_LABELS: Record<string, string> = {
  api_call: 'Chamadas de API', upload: 'Uploads', ai_generation: 'Gerações de IA', outreach: 'Disparos',
}

export function UsageCard() {
  const { company } = useAuth()
  const [data, setData] = useState<UsageData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!company?.id) return
    api.company.getUsage(company.id).then(res => {
      if (res.success && res.data) setData(res.data)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [company?.id])

  return (
    <Card className="rounded-2xl border border-border bg-card shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-[family-name:var(--font-display)] text-lg font-bold tracking-[-0.02em]">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent"><BarChart3 className="h-4 w-4 text-primary" /></span>
          Uso & Quotas
        </CardTitle>
        <CardDescription>Consumo de hoje vs. limite diário do plano e total dos últimos 30 dias.</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : !data ? (
          <p className="py-4 text-center text-sm text-muted-foreground">Sem dados de uso ainda.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {Object.entries(data.byKind).map(([kind, k]) => {
              const pct = k.quota ? Math.min(100, Math.round((k.today / k.quota) * 100)) : 0
              const barColor = pct >= 90 ? 'bg-destructive' : pct >= 60 ? 'bg-warning' : 'bg-primary'
              return (
                <div key={kind} className="rounded-xl border border-border p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{KIND_LABELS[kind] ?? kind}</span>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {k.today}{k.quota ? ` / ${k.quota}` : ''} hoje
                    </span>
                  </div>
                  {k.quota ? (
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-muted-foreground">Ilimitado</p>
                  )}
                  <p className="mt-1.5 text-xs text-muted-foreground tabular-nums">{k.last30} nos últimos 30 dias</p>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
