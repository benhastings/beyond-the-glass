import type { ReactNode } from 'react'
import { cx } from './styles'

const KINDS = {
  info: { label: 'Note', icon: 'ℹ', className: 'border-info' },
  warn: { label: 'Heads up', icon: '▲', className: 'border-warn' },
  success: { label: 'Done', icon: '✓', className: 'border-ok' },
  eli5: { label: 'In plain words', icon: '✦', className: 'border-accent' },
} as const

export type CalloutKind = keyof typeof KINDS

export interface CalloutProps {
  kind?: CalloutKind
  /** Overrides the kind's visible label. */
  title?: ReactNode
  children: ReactNode
}

/** An aside with a visible label and icon, so its kind never depends on colour alone. */
export function Callout({ kind = 'info', title, children }: CalloutProps) {
  const k = KINDS[kind]
  return (
    <aside
      aria-label={typeof title === 'string' ? title : k.label}
      className={cx('rounded-md border-l-8 bg-raised p-4 text-ink', k.className)}
    >
      <p className="flex items-center gap-2 font-bold">
        <span aria-hidden="true">{k.icon}</span>
        {title ?? k.label}
      </p>
      <div className="mt-1">{children}</div>
    </aside>
  )
}
