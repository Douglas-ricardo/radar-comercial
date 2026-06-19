//components/insights/empty-state.tsx
import { Button } from '@/components/ui/button'
import { Search } from 'lucide-react'

interface EmptyStateProps {
  title: string
  description: string
  action?: { label: string; onClick: () => void }
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div
      className="flex flex-col items-center justify-center py-16 text-center animate-in fade-in duration-500"
      role="status"
      aria-label={title}
    >
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-border bg-secondary">
        <Search className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
      </div>
      <h3 className="text-sm font-medium text-foreground mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">{description}</p>
      {action && (
        <Button
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={action.onClick}
        >
          {action.label}
        </Button>
      )}
    </div>
  )
}
