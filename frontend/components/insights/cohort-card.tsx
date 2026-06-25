'use client'

import { useState, useEffect } from 'react'
import { api } from '@/lib/api/client'
import type { CohortData } from '@/types'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Users } from 'lucide-react'

/** Cor de fundo por nível de retenção (heatmap verde). */
function cellColor(pct: number): string {
  if (pct >= 80) return 'bg-success/30 text-success-foreground'
  if (pct >= 60) return 'bg-success/20'
  if (pct >= 40) return 'bg-success/12'
  if (pct >= 20) return 'bg-warning/12'
  if (pct > 0) return 'bg-destructive/10'
  return 'bg-muted/40 text-muted-foreground'
}

export function CohortCard({ companyId }: { companyId: string }) {
  const [data, setData] = useState<CohortData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    api.insights.getCohorts(companyId).then(res => {
      if (active) { if (res.success && res.data) setData(res.data); setLoading(false) }
    }).catch(() => active && setLoading(false))
    return () => { active = false }
  }, [companyId])

  if (loading) return <Skeleton className="h-64 w-full rounded-2xl bg-muted" />
  if (!data || data.cohorts.length === 0) return null

  // Safras com menos de 5 clientes não têm retenção estatisticamente confiável — ocultar.
  const visibleCohorts = data.cohorts.filter(row => row.size >= 5)
  if (visibleCohorts.length === 0) return null

  const cols = Array.from({ length: data.maxOffset + 1 }, (_, i) => i)

  return (
    <Card className="rounded-2xl shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 font-[family-name:var(--font-display)] text-lg font-bold tracking-[-0.02em]">
          <Users className="h-5 w-5 text-primary" /> Retenção por safra (cohorts)
        </CardTitle>
        <CardDescription>% de clientes de cada safra de aquisição que seguiram comprando nos meses seguintes.</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-1 text-xs">
          <thead>
            <tr>
              <th className="px-2 py-1 text-left font-medium text-muted-foreground">Safra</th>
              <th className="px-2 py-1 text-right font-medium text-muted-foreground">Clientes</th>
              {cols.map(c => <th key={c} className="px-2 py-1 text-center font-medium text-muted-foreground">M{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {visibleCohorts.map(row => (
              <tr key={row.cohort}>
                <td className="px-2 py-1 font-medium whitespace-nowrap">{row.cohort}</td>
                <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">{row.size}</td>
                {cols.map(c => (
                  <td key={c} className={`px-2 py-1.5 text-center tabular-nums rounded ${row.retention[c] !== undefined ? cellColor(row.retention[c]) : ''}`}>
                    {row.retention[c] !== undefined ? `${row.retention[c]}%` : ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  )
}
