import { useMemo } from 'react'
import { diffRows } from '@/sim/commands/unified-diff'
import { cx, focusRing } from '../ui/styles'

/** What a screen reader hears for one line: "added line 14: memory: 512Mi". */
export function announce(kind: '+' | '-' | ' ', line: number, text: string): string {
  const what = kind === '+' ? 'added' : kind === '-' ? 'removed' : 'unchanged'
  return `${what} line ${String(line)}: ${text.trim() || '(blank)'}`
}

/**
 * A real unified diff (E7-03): hunk headers, line numbers on both sides, and `+`/`-` markers. Each line
 * is read out in words, and a polite summary says how many lines changed.
 */
export function DiffView({
  before,
  after,
  label,
}: {
  before: string
  after: string
  label: string
}) {
  const rows = useMemo(() => diffRows(before, after), [before, after])
  const added = rows.filter((r) => r.kind === '+').length
  const removed = rows.filter((r) => r.kind === '-').length
  const summary =
    rows.length === 0
      ? 'No changes yet.'
      : `${String(added)} line${added === 1 ? '' : 's'} added, ${String(removed)} removed.`
  return (
    <section aria-label={label} className="grid min-w-0 gap-2">
      <p role="status" className="text-sm">
        {summary}
      </p>
      {rows.length > 0 && (
        <div
          // It scrolls sideways on narrow screens, so it must be keyboard-reachable.
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
          tabIndex={0}
          role="group"
          aria-label={`${label}: lines`}
          className={cx(
            'w-0 min-w-full overflow-x-auto rounded-md border border-line font-mono text-sm',
            focusRing,
          )}
        >
          <ol className="min-w-max">
            {rows.map((r, i) => {
              if (r.kind === '@')
                return (
                  <li key={i} className="bg-raised px-2 text-ink-muted">
                    <span aria-hidden="true">{r.text}</span>
                    <span className="sr-only">
                      Changes near {r.text.replace(/^@@ -[\d,]+ \+(\d+).*$/, 'line $1')}
                    </span>
                  </li>
                )
              const oldLine = r.kind === '+' ? '' : String(r.oldLine)
              const newLine = r.kind === '-' ? '' : String(r.newLine)
              return (
                <li
                  key={i}
                  className={cx(
                    'grid grid-cols-[3ch_3ch_2ch_1fr] gap-x-2 px-2 whitespace-pre',
                    r.kind === '+' && 'bg-ok/15',
                    r.kind === '-' && 'bg-alert/15',
                  )}
                >
                  <span aria-hidden="true" className="text-right text-ink-muted">
                    {oldLine}
                  </span>
                  <span aria-hidden="true" className="text-right text-ink-muted">
                    {newLine}
                  </span>
                  <span aria-hidden="true" className="font-bold">
                    {r.kind === ' ' ? '' : r.kind}
                  </span>
                  <span aria-hidden="true">{r.text}</span>
                  <span className="sr-only">
                    {announce(r.kind, r.kind === '-' ? r.oldLine : r.newLine, r.text)}
                  </span>
                </li>
              )
            })}
          </ol>
        </div>
      )}
    </section>
  )
}
