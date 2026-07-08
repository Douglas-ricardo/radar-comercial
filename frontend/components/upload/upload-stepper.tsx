//components/upload/upload-stepper.tsx
import { cn } from '@/lib/utils'
import type { UploadStatus } from '@/hooks/use-file-upload'
import { Check } from 'lucide-react'

const STEPS = [
  { id: 'idle', label: 'Selecionar' },
  { id: 'uploading', label: 'Enviando' },
  { id: 'processing', label: 'Analisando' },
  { id: 'completed', label: 'Concluído' },
] as const

const STATUS_TO_STEP: Record<UploadStatus, number> = {
  idle: 0,
  failed: 1,
  needs_confirmation: 1,
  uploading: 1,
  processing: 2,
  completed: 3,
}

interface UploadStepperProps {
  status: UploadStatus
}

export function UploadStepper({ status }: UploadStepperProps) {
  const currentStep = STATUS_TO_STEP[status]
  const isFailed = status === 'failed'

  return (
    <nav aria-label="Progresso do upload" className="w-full max-w-3xl mx-auto mb-8">
      <ol className="flex items-center w-full">
        {STEPS.map((step, index) => {
          const isCompleted =
            index < currentStep || (status === 'completed' && index === currentStep)
          const isCurrent = index === currentStep && status !== 'completed'
          const isError = isFailed && index === currentStep

          return (
            <li
              key={step.id}
              className={cn(
                'relative flex flex-col items-center',
                index !== STEPS.length - 1 ? 'flex-1' : ''
              )}
            >
              <div className="flex items-center w-full">
                {/* Linha esquerda */}
                <div
                  className={cn(
                    'h-px w-full transition-colors duration-500',
                    index === 0
                      ? 'bg-transparent'
                      : isCompleted || isCurrent || isError
                      ? 'bg-primary/40'
                      : 'bg-border'
                  )}
                  aria-hidden="true"
                />

                {/* Círculo indicador */}
                <div
                  className={cn(
                    'h-8 w-8 rounded-full border-2 flex items-center justify-center text-xs font-semibold transition-all duration-300 shrink-0 z-10',
                    isError
                      ? 'border-destructive bg-destructive/10 text-destructive'
                      : isCompleted
                      ? 'border-primary bg-primary text-primary-foreground'
                      : isCurrent
                      ? 'border-primary bg-background text-primary ring-4 ring-primary/10'
                      : 'border-muted bg-background text-muted-foreground'
                  )}
                  aria-current={isCurrent ? 'step' : undefined}
                >
                  {isCompleted ? (
                    <Check className="h-4 w-4" strokeWidth={3} aria-hidden="true" />
                  ) : (
                    <span aria-hidden="true">{index + 1}</span>
                  )}
                  <span className="sr-only">
                    Etapa {index + 1}:{' '}
                    {isError
                      ? 'falhou'
                      : isCompleted
                      ? 'concluída'
                      : isCurrent
                      ? 'em andamento'
                      : 'pendente'}
                  </span>
                </div>

                {/* Linha direita */}
                <div
                  className={cn(
                    'h-px w-full transition-colors duration-500',
                    index === STEPS.length - 1
                      ? 'bg-transparent'
                      : isCompleted
                      ? 'bg-primary/40'
                      : 'bg-border'
                  )}
                  aria-hidden="true"
                />
              </div>

              {/* Label */}
              <span
                className={cn(
                  'absolute top-10 text-[11px] font-medium tracking-wide uppercase',
                  isError
                    ? 'text-destructive'
                    : isCompleted
                    ? 'text-primary'
                    : isCurrent
                    ? 'text-foreground'
                    : 'text-muted-foreground'
                )}
                aria-hidden="true"
              >
                {isError ? 'Falhou' : step.label}
              </span>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
