import { Progress as P } from 'radix-ui'

export interface ProgressProps {
  /** What is progressing ("Lessons in Helm Keep"). */
  label: string
  value: number
  max: number
  /** Spoken value (default "n of max"). Shown beside the bar too, so the bar is never the only signal. */
  valueText?: string
}

/** A labelled progress bar with its value in words beside it. */
export function Progress({ label, value, max, valueText }: ProgressProps) {
  const text = valueText ?? `${String(value)} of ${String(max)}`
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0
  return (
    <div className="grid gap-1">
      <div className="flex justify-between gap-4 text-sm">
        <span>{label}</span>
        <span className="text-ink-muted">{text}</span>
      </div>
      <P.Root
        value={value}
        max={max}
        aria-label={label}
        getValueLabel={() => text}
        className="h-3 overflow-hidden rounded-pill border border-line bg-raised"
      >
        <P.Indicator className="h-full bg-accent" style={{ width: `${String(pct)}%` }} />
      </P.Root>
    </div>
  )
}
