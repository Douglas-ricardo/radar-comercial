'use client'

import { Button } from '@/components/ui/button'
import { cn, formatCurrency } from '@/lib/utils'
import { Clock, Sparkles, ArrowRight, Phone, CheckCircle2, XCircle, ChevronRight } from 'lucide-react'
import type { Opportunity, OpportunityStatus } from '@/types'

interface OpportunityCardProps {
  customer: string
  expectedValue: number
  daysInactive?: number
  product?: string | null
  frequency?: string | null
  confidence?: Opportunity['confidence']  // mantido no contrato; não exibido
  recoveryScore?: number
  recoveryBand?: 'alta' | 'media' | 'baixa'
  recoveryReasons?: string[]
  status?: OpportunityStatus
  outOfBase?: boolean
  compact?: boolean
  onOpen?: () => void
  onGenerateMessage?: () => void
  className?: string
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
  outOfBase = false,
  compact = false,
  onOpen,
  onGenerateMessage,
  className,
}: OpportunityCardProps) {
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
        compact ? 'p-3' : 'p-4 sm:p-5',
        onOpen && 'cursor-pointer hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
        className,
      )}
    >
      {/* topo: cliente + inatividade */}
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-medium leading-tight text-foreground">{customer}</h3>
        {outOfBase ? (
          <span
            className="flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
            title="Este cliente não está na base atual (foi substituído por um novo upload), mas o histórico comercial foi preservado."
          >
            Fora da base atual
          </span>
        ) : typeof daysInactive === 'number' && daysInactive > 0 ? (
          <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground tabular-nums">
            <Clock className="h-3.5 w-3.5" aria-hidden /> {daysInactive} dias inativo
          </span>
        ) : null}
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

      {/* número-herói */}
      <div className="mt-3">
        <p className={cn('font-mono leading-none text-primary tabular-nums', compact ? 'text-lg' : 'text-xl sm:text-2xl')}>
          {formatCurrency(expectedValue)}
        </p>
        <p className="mt-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          valor recuperável
        </p>
      </div>

      {/* rodapé: status + ação */}
      <div className="mt-3 flex items-center justify-between border-t border-border pt-2.5">
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
            className="h-11 gap-1.5 text-xs text-primary hover:bg-primary/5 sm:h-7"
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
