//components/insights/chart-tooltip.tsx

interface ChartTooltipProps {
  active?: boolean
  payload?: Array<{ name: string; value: number; color: string }>
  label?: string
  formatter?: (name: string, value: number) => string
}

export function ChartTooltip({
  active,
  payload,
  label,
  formatter,
}: ChartTooltipProps) {
  if (!active || !payload?.length) return null

  return (
    <div
      className="rounded-lg border border-border bg-background px-3 py-2.5 text-sm shadow-xl"
      role="tooltip"
    >
      {label && (
        <p className="font-medium mb-1.5 text-foreground">{label}</p>
      )}
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center gap-2 text-muted-foreground">
          <span
            className="inline-block h-2.5 w-2.5 rounded-[2px] shrink-0"
            style={{ backgroundColor: entry.color }}
            aria-hidden="true"
          />
          <span>
            {formatter ? formatter(entry.name, entry.value) : entry.value}
          </span>
        </div>
      ))}
    </div>
  )
}
