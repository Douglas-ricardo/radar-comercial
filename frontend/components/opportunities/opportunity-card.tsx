'use client'

import { Button } from '@/components/ui/button'
import { cn, formatCurrency } from '@/lib/utils'
import { Clock, Sparkles, ArrowRight, Phone, CheckCircle2, XCircle, ChevronRight } from 'lucide-react'
import type { Opportunity, OpportunityStatus } from '@/types'

// Derivado do contrato (types/index.ts) — garante compatibilidade pelo compilador,
// nunca uma união copiada à mão. InsightsData.opportunities[].confidence === Opportunity['confidence'].
type Confidence = Opportunity['confidence']

interface OpportunityCardProps {
  customer: string
  expectedValue: number
  daysInactive?: number
  product?: string | null
  frequency?: string | null
  confidence?: Confidence
  recoveryScore?: number
  recoveryBand?: 'alta' | 'media' | 'baixa'
  recoveryReasons?: string[]
  status?: OpportunityStatus
  compact?: boolean
  onOpen?: () => void
  onGenerateMessage?: () => void
  className?: string
}

const CONFIDENCE: Record<Confidence, { label: string; tone: string }> = {
  high: { label: 'alta confiança', tone: 'text-success' },
  medium: { label: 'média confiança', tone: 'text-warning' },
  low: { label: 'baixa confiança', tone: 'text-muted-foreground' },
}

const STATUS: Record<OpportunityStatus, { label: string; icon: typeof Phone; cls: string }> = {
  to_contact: { label: 'A contatar', icon: Phone, cls: 'text-warning bg-warning/10' },
  contacted: { label: 'Contatado', icon: ChevronRight, cls: 'text-primary bg-primary/10' },
  won: { label: 'Ganho', icon: CheckCircle2, cls: 'text-success bg-success/10' },
  lost: { label: 'Perdido', icon: XCircle, cls: 'text-destructive bg-destructive/10' },
}

export function OpportunityCard({
  customer,
  expectedValue,
  daysInactive,
  product,
  frequency,
  confidence = 'medium',
  recoveryScore,
  recoveryBand,
  recoveryReasons,
  status,
  compact = false,
  onOpen,
  onGenerateMessage,
  className,
}: OpportunityCardProps) {
  const conf = CONFIDENCE[confidence]
  const st = status ? STATUS[status] : null
  const StatusIcon = st?.icon

  return (
    <div
      onClick={onOpen}
      role={onOpen ? 'button' : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onKeyDown={onOpen ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen() } } : undefined}
      className={cn(
        'group rounded-[var(--radius)] border border-border bg-card transition-colors',
        compact ? 'p-3.5' : 'p-5',
        onOpen && 'cursor-pointer hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
        className,
      )}
    >
      {/* topo: cliente + inatividade */}
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-medium leading-tight text-foreground">{customer}</h3>
        {typeof daysInactive === 'number' && daysInactive > 0 && (
          <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground tabular-nums">
            <Clock className="h-3.5 w-3.5" aria-hidden /> {daysInactive} dias inativo
          </span>
        )}
      </div>
      {(product || frequency) && (
        <p className="mt-1 text-xs text-muted-foreground">
          {product ?? 'Diversos'}
          {frequency ? ` · ${frequency}` : ''}
        </p>
      )}
      {recoveryBand && typeof recoveryScore === 'number' && (
        <>
          <span
            className={cn(
              'mt-1.5 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums',
              recoveryBand === 'alta' ? 'bg-success/10 text-success'
              : recoveryBand === 'media' ? 'bg-warning/10 text-warning'
              : 'bg-muted text-muted-foreground',
            )}
            title="Recuperabilidade (0-100): chance relativa de reativar com base no histórico"
          >
            {recoveryScore} · {recoveryBand === 'media' ? 'média' : recoveryBand} recuperação
          </span>
          {recoveryReasons && recoveryReasons.length > 0 && (
            <p className="mt-0.5 text-xs text-muted-foreground">{recoveryReasons[0]}</p>
          )}
        </>
      )}

      {/* número-herói: serifa, tinta-navy, figuras tabulares */}
      <div className="mt-4 flex items-end justify-between gap-3">
        <div>
          <p className={cn('font-mono leading-none text-primary tabular-nums', compact ? 'text-xl' : 'text-2xl')}>
            {formatCurrency(expectedValue)}
          </p>
          <p className="mt-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            valor recuperável
          </p>
        </div>
        <span className={cn('flex items-center gap-1.5 text-xs font-medium', conf.tone)}>
          <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden /> {conf.label}
        </span>
      </div>

      {/* rodapé: status + ação */}
      <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
        {st && StatusIcon ? (
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
              st.cls,
            )}
          >
            <StatusIcon className="h-3.5 w-3.5" aria-hidden /> {st.label}
          </span>
        ) : (
          <span />
        )}
        {onGenerateMessage && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 text-xs text-primary hover:bg-primary/5"
            onClick={(e) => {
              e.stopPropagation()
              onGenerateMessage()
            }}
          >
            <Sparkles className="h-3.5 w-3.5" /> Gerar mensagem
            <ArrowRight className="h-3.5 w-3.5 opacity-60 transition-transform motion-safe:group-hover:translate-x-0.5" />
          </Button>
        )}
      </div>
    </div>
  )
}
