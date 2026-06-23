//components/upload/upload-progress.tsx
'use client'

import { cn } from '@/lib/utils'
import { CheckCircle, Loader2, AlertCircle, FileSpreadsheet } from 'lucide-react'

interface UploadProgressProps {
  filename: string
  status: 'uploading' | 'processing' | 'completed' | 'failed'
  progress: number
  errorMessage?: string
}

const statusConfig = {
  uploading: {
    label: 'Enviando arquivo...',
    barColor: 'bg-primary',
    icon: Loader2,
    iconClass: 'animate-spin text-primary',
  },
  processing: {
    label: 'Processando análise...',
    barColor: 'bg-primary',
    icon: Loader2,
    iconClass: 'animate-spin text-primary',
  },
  completed: {
    label: 'Análise concluída!',
    barColor: 'bg-success',
    icon: CheckCircle,
    iconClass: 'text-success',
  },
  failed: {
    label: 'Erro no processamento',
    barColor: 'bg-destructive',
    icon: AlertCircle,
    iconClass: 'text-destructive',
  },
} as const

function ProcessingStep({
  label,
  completed,
  current,
}: {
  label: string
  completed: boolean
  current: boolean
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {completed ? (
        <CheckCircle className="h-4 w-4 text-success" aria-hidden="true" />
      ) : current ? (
        <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden="true" />
      ) : (
        <div className="h-4 w-4 rounded-full border-2 border-muted" aria-hidden="true" />
      )}
      <span className={cn(completed ? 'text-foreground' : 'text-muted-foreground')}>
        {label}
      </span>
      <span className="sr-only">
        {completed ? '— concluído' : current ? '— em andamento' : '— aguardando'}
      </span>
    </div>
  )
}

export function UploadProgress({
  filename,
  status,
  progress,
  errorMessage,
}: UploadProgressProps) {
  const config = statusConfig[status]
  const Icon = config.icon
  const roundedProgress = Math.round(progress)

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-accent">
          <FileSpreadsheet className="h-6 w-6 text-primary" aria-hidden="true" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="truncate font-medium">{filename}</p>
              <div
                className="mt-1 flex items-center gap-2"
                role="status"
                aria-live="polite"
                aria-atomic="true"
              >
                <Icon className={cn('h-4 w-4', config.iconClass)} aria-hidden="true" />
                <span className="text-sm text-muted-foreground">{config.label}</span>
              </div>
            </div>
            {status !== 'failed' && (
              <span
                className="shrink-0 text-sm font-medium tabular-nums"
                aria-label={`${roundedProgress}% concluído`}
              >
                {roundedProgress}%
              </span>
            )}
          </div>

          {/* Barra de progresso semântica */}
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-accent/60">
            <div
              role="progressbar"
              aria-valuenow={roundedProgress}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Progresso: ${roundedProgress}%`}
              className={cn('h-full rounded-full transition-all duration-500', config.barColor)}
              style={{ width: `${roundedProgress}%` }}
            />
          </div>

          {status === 'failed' && errorMessage && (
            <p className="mt-3 text-sm text-destructive" role="alert">
              {errorMessage}
            </p>
          )}

          {(status === 'processing' || status === 'completed') && (
            <div className="mt-4 space-y-2" aria-label="Etapas do processamento">
              <ProcessingStep
                label="Validando estrutura do arquivo"
                completed={progress >= 25}
                current={progress < 25}
              />
              <ProcessingStep
                label="Extraindo dados de vendas"
                completed={progress >= 50}
                current={progress >= 25 && progress < 50}
              />
              <ProcessingStep
                label="Calculando métricas"
                completed={progress >= 75}
                current={progress >= 50 && progress < 75}
              />
              <ProcessingStep
                label="Identificando oportunidades perdidas"
                completed={progress >= 100}
                current={progress >= 75 && progress < 100}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
