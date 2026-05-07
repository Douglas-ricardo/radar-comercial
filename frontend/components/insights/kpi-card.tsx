//components/insights/kpi-card.tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ArrowUpRight, ArrowDownRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

interface KpiCardProps {
  label: string
  value: string
  delta?: {
    value: string
    direction: 'up' | 'down' | 'neutral'
    label: string
  }
  icon: ReactNode
  variant?: 'default' | 'danger'
}

export function KpiCard({ label, value, delta, icon, variant = 'default' }: KpiCardProps) {
  return (
    <Card
      className={cn(
        'transition-all hover:shadow-sm',
        variant === 'danger' && 'border-destructive/20'
      )}
    >
      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {label}
        </CardTitle>
        <span className="text-muted-foreground" aria-hidden="true">
          {icon}
        </span>
      </CardHeader>
      <CardContent className="space-y-1">
        <p
          className={cn(
            'text-2xl font-semibold tracking-tight',
            variant === 'danger' && 'text-destructive'
          )}
          aria-label={`${label}: ${value}`}
        >
          {value}
        </p>
        {delta && (
          <div
            className={cn(
              'flex items-center gap-1 text-xs',
              delta.direction === 'up' && 'text-success',
              delta.direction === 'down' && 'text-destructive',
              delta.direction === 'neutral' && 'text-muted-foreground'
            )}
            aria-label={`Variação: ${delta.value} ${delta.label}`}
          >
            {delta.direction === 'up' && (
              <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
            )}
            {delta.direction === 'down' && (
              <ArrowDownRight className="h-3 w-3" aria-hidden="true" />
            )}
            <span className="font-medium">{delta.value}</span>
            <span className="text-muted-foreground">{delta.label}</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function KpiCardSkeleton() {
  return (
    <Card aria-busy="true" aria-label="Carregando métrica...">
      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-4 w-4 rounded" />
      </CardHeader>
      <CardContent className="space-y-2">
        <Skeleton className="h-7 w-36" />
        <Skeleton className="h-3 w-24" />
      </CardContent>
    </Card>
  )
}
