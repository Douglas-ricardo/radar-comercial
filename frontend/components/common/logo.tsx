//components/common/logo.tsx
import { cn } from '@/lib/utils'

interface LogoProps {
  className?: string
  showText?: boolean
  size?: 'sm' | 'md' | 'lg'
}

export function Logo({ className, showText = true, size = 'md' }: LogoProps) {
  const sizeClasses = {
    sm: 'h-6 w-6',
    md: 'h-8 w-8',
    lg: 'h-10 w-10',
  }

  const textSizeClasses = {
    sm: 'text-base',
    md: 'text-lg',
    lg: 'text-xl',
  }

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className={cn('relative', sizeClasses[size])}>
        <svg
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="h-full w-full"
          aria-hidden="true"
          focusable="false"
        >
          <circle
            cx="16"
            cy="16"
            r="14"
            stroke="currentColor"
            strokeWidth="2"
            className="text-primary"
          />
          <circle
            cx="16"
            cy="16"
            r="9"
            stroke="currentColor"
            strokeWidth="1.5"
            className="text-primary/60"
          />
          <circle cx="16" cy="16" r="4" fill="currentColor" className="text-primary" />
          <line
            x1="16"
            y1="16"
            x2="28"
            y2="8"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            className="text-primary"
          />
          <circle cx="24" cy="12" r="2" fill="currentColor" className="text-chart-2" />
          <circle cx="20" cy="22" r="1.5" fill="currentColor" className="text-chart-3" />
        </svg>
      </div>
      {showText && (
        <span className={cn('font-semibold text-foreground', textSizeClasses[size])}>
          Radar Comercial
        </span>
      )}
    </div>
  )
}
