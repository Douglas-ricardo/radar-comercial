//components/upload/upload-states.tsx
import { FileSpreadsheet, XCircle, CheckCircle2, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FileUploadZone } from './file-upload-zone'
import { UploadProgress } from './upload-progress'
import type { UploadStatus } from '@/hooks/use-file-upload'

interface IdleStateProps {
  onFileSelect: (file: File) => void
}

export function IdleState({ onFileSelect }: IdleStateProps) {
  return (
    <div className="animate-in fade-in duration-500">
      <FileUploadZone onFileSelect={onFileSelect} maxSize={50} />
    </div>
  )
}

interface ConfirmStateProps {
  file: File
  status: UploadStatus
  errorMessage: string | null
  onUpload: () => void
  onReset: () => void
}

export function ConfirmState({
  file,
  status,
  errorMessage,
  onUpload,
  onReset,
}: ConfirmStateProps) {
  const isFailed = status === 'failed'
  const fileSizeMB = (file.size / 1024 / 1024).toFixed(2)

  return (
    <div className="animate-in fade-in zoom-in-95 duration-300">
      <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-primary/20 rounded-xl bg-primary/5">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-background border border-border shadow-sm mb-4">
          <FileSpreadsheet className="h-8 w-8 text-primary" aria-hidden="true" />
        </div>
        <h3 className="text-base font-semibold text-foreground">{file.name}</h3>
        <p className="text-sm text-muted-foreground">{fileSizeMB} MB</p>

        {isFailed && errorMessage && (
          <div
            role="alert"
            className="mt-4 mb-2 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 max-w-sm w-full animate-in slide-in-from-top-2"
          >
            <XCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" aria-hidden="true" />
            <p className="text-sm text-destructive font-medium">{errorMessage}</p>
          </div>
        )}

        <div className="flex gap-3 mt-6 w-full max-w-sm">
          <Button variant="outline" className="flex-1" onClick={onReset}>
            Trocar arquivo
          </Button>
          <Button
            className="flex-1 shadow-md hover:shadow-lg transition-all"
            onClick={onUpload}
          >
            {isFailed ? 'Tentar novamente' : 'Iniciar análise'}
            <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </div>
    </div>
  )
}

interface InProgressStateProps {
  file: File
  status: 'uploading' | 'processing'
  progress: number
}

export function InProgressState({ file, status, progress }: InProgressStateProps) {
  return (
    <div className="animate-in slide-in-from-bottom-4 duration-500">
      <UploadProgress filename={file.name} status={status} progress={progress} />
    </div>
  )
}

interface CompletedStateProps {
  onNewUpload: () => void
  onViewInsights: () => void
}

export function CompletedState({ onNewUpload, onViewInsights }: CompletedStateProps) {
  return (
    <div className="animate-in fade-in zoom-in-95 duration-500 flex flex-col items-center py-12 text-center rounded-xl bg-gradient-to-b from-success/10 to-transparent border border-success/20">
      <div
        className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-success/20 ring-8 ring-success/10"
        aria-hidden="true"
      >
        <CheckCircle2 className="h-10 w-10 text-success" />
      </div>
      <h2 className="text-2xl font-bold tracking-tight text-foreground">
        Análise concluída!
      </h2>
      <p className="mt-3 max-w-md text-sm text-muted-foreground leading-relaxed">
        Seu arquivo foi processado. O Radar já calculou as métricas de recência, frequência e
        valor para toda a sua base de clientes.
      </p>
      <div className="mt-8 flex gap-3">
        <Button variant="outline" onClick={onNewUpload} className="h-11 px-6">
          Processar outro
        </Button>
        <Button
          onClick={onViewInsights}
          className="h-11 px-6 bg-success hover:bg-success/90 text-success-foreground shadow-md hover:shadow-lg transition-all"
        >
          Explorar insights
          <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  )
}
