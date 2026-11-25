import { STATUS_LABELS, type JourneyStatus } from '@/placement'
import { cx } from '../ui/styles'

/** Each status has a symbol and words as well as a colour, so it never relies on colour (E2-03.AC2). */
const LOOK: Readonly<Record<JourneyStatus, { symbol: string; className: string }>> = {
  recommended: { symbol: '★', className: 'border-accent bg-accent text-accent-ink' },
  'in-progress': { symbol: '◐', className: 'border-info' },
  complete: { symbol: '✓', className: 'border-ok' },
  optional: { symbol: '○', className: 'border-dashed border-line' },
  'not-started': { symbol: '·', className: 'border-line' },
}

export function StatusBadge({ status }: { status: JourneyStatus }) {
  const l = LOOK[status]
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-full border-2 px-2 text-sm',
        l.className,
      )}
    >
      <span aria-hidden="true">{l.symbol}</span>
      {STATUS_LABELS[status]}
    </span>
  )
}
