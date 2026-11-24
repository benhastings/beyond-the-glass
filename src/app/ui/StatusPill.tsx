import type { ReactNode } from 'react'
import { cx } from './styles'

const STATUS = {
  ok: { icon: '✓', className: 'text-ok border-ok' },
  warn: { icon: '▲', className: 'text-warn border-warn' },
  alert: { icon: '●', className: 'text-alert border-alert' },
  info: { icon: 'ℹ', className: 'text-info border-info' },
  neutral: { icon: '○', className: 'text-ink-muted border-line' },
} as const

export type Status = keyof typeof STATUS

/** A status shown as an icon **and** words (never colour alone): "✓ Synced", "● Degraded". */
export function StatusPill({ status, children }: { status: Status; children: ReactNode }) {
  const s = STATUS[status]
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-0.5 text-sm font-bold',
        s.className,
      )}
    >
      <span aria-hidden="true">{s.icon}</span>
      {children}
    </span>
  )
}

/** A neutral label: a count, a level, a tag. */
export function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-pill bg-raised px-2.5 py-0.5 text-sm text-ink">
      {children}
    </span>
  )
}
