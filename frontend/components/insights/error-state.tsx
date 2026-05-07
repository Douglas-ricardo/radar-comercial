//components/insights/error-state.tsx
import { Button } from '@/components/ui/button'
import { AlertCircle } from 'lucide-react'

interface ErrorStateProps {
  message: string
  onRetry: () => void
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div
      className="flex flex-col items-center justify-center py-16 text-center animate-in fade-in zoom-in-95"
      role="alert"
    >
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
        <AlertCircle className="h-5 w-5 text-destructive" aria-hidden="true" />
      </div>
      <h3 className="text-sm font-medium text-foreground mb-1">Erro ao carregar dados</h3>
      <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">{message}</p>
      <Button
        variant="outline"
        size="sm"
        className="mt-4 hover:bg-destructive hover:text-destructive-foreground transition-colors"
        onClick={onRetry}
      >
        Tentar novamente
      </Button>
    </div>
  )
}
