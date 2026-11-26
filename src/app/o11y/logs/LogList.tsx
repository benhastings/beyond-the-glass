import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { LogEntry } from '@/sim/logql/logql'
import { parseJsonLine } from '@/sim/logql/logql'
import { cx, focusRing } from '../../ui/styles'

const ROW_REM = 2
const OVERSCAN = 10
const time = (epochMs: number, t: number) => new Date(epochMs + t).toISOString().slice(11, 23)

/**
 * A long list of log lines (E8-04.AC3): only the rows in view are in the DOM, so 10,000 lines stay quick;
 * it keeps list semantics (each row says it is line n of N), and Up/Down, Page Up/Down, Home and End move
 * between lines. Enter shows a line's parsed fields; a trace ID is a button that opens the trace.
 */
export function LogList({
  entries,
  epochMs,
  selected,
  onSelect,
  onOpenTrace,
  label,
}: {
  entries: readonly LogEntry[]
  epochMs: number
  selected?: number
  onSelect: (i: number) => void
  onOpenTrace?: (traceId: string, spanId?: string) => void
  label: string
}) {
  const id = useId()
  const box = useRef<HTMLDivElement>(null)
  const [scroll, setScroll] = useState({ top: 0, height: 0 })
  // Rows are 2rem: in pixels, at the reader's text size.
  const [rowPx] = useState(
    () => ROW_REM * (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16),
  )
  const [active, setActive] = useState(0)
  const focusNext = useRef<number | undefined>(undefined)
  const n = entries.length
  const first = Math.max(0, Math.floor(scroll.top / rowPx) - OVERSCAN)
  const last = Math.min(n, Math.ceil((scroll.top + (scroll.height || 24 * 16)) / rowPx) + OVERSCAN)
  const cur = Math.min(active, Math.max(0, n - 1))
  // Keep the active row rendered even when it's scrolled away.
  const rows = [
    ...new Set([
      ...Array.from({ length: Math.max(0, last - first) }, (_, k) => first + k),
      ...(n ? [cur] : []),
    ]),
  ].sort((a, b) => a - b)
  useLayoutEffect(() => {
    const i = focusNext.current
    if (i === undefined) return
    focusNext.current = undefined
    document.getElementById(`${id}-line-${String(i)}`)?.focus()
  })
  const go = (i: number) => {
    const to = Math.max(0, Math.min(n - 1, i))
    setActive(to)
    const el = box.current
    if (el) {
      const top = to * rowPx
      if (top < el.scrollTop) el.scrollTop = top
      else if (top + rowPx > el.scrollTop + el.clientHeight)
        el.scrollTop = top + rowPx - el.clientHeight
      setScroll({ top: el.scrollTop, height: el.clientHeight })
    }
    focusNext.current = to
  }
  const page = Math.max(1, Math.floor((scroll.height || 384) / rowPx) - 1)
  const onKey = (e: KeyboardEvent, i: number) => {
    const to = {
      ArrowDown: i + 1,
      ArrowUp: i - 1,
      PageDown: i + page,
      PageUp: i - page,
      Home: 0,
      End: n - 1,
    }[e.key]
    if (to === undefined) return
    e.preventDefault()
    go(to)
  }
  return (
    <div
      ref={box}
      className="relative h-96 w-0 min-w-full overflow-auto rounded-md border border-line bg-term-ground font-mono text-xs text-term-ink"
      onScroll={(e) => {
        setScroll({ top: e.currentTarget.scrollTop, height: e.currentTarget.clientHeight })
      }}
    >
      <ul aria-label={label} style={{ height: `${String(n * rowPx)}px` }} className="relative">
        {rows.map((i) => {
          const e = entries[i]
          if (!e) return null
          const f = e.fields ?? parseJsonLine(e.line)
          const traceId = f?.trace_id
          const level = f?.level
          return (
            <li
              key={i}
              aria-setsize={n}
              aria-posinset={i + 1}
              className={cx(
                'absolute right-0 left-0 flex items-center gap-2 px-2',
                selected === i && 'bg-raised text-ink',
              )}
              style={{ top: `${String(i * rowPx)}px`, height: `${String(rowPx)}px` }}
            >
              <button
                type="button"
                id={`${id}-line-${String(i)}`}
                tabIndex={i === cur ? 0 : -1}
                aria-expanded={selected === i}
                className={cx('min-w-0 grow truncate text-left', focusRing)}
                onFocus={() => {
                  setActive(i)
                }}
                onKeyDown={(ev) => {
                  onKey(ev, i)
                }}
                onClick={() => {
                  setActive(i)
                  onSelect(i)
                }}
              >
                <span className="text-term-ink-muted">{time(epochMs, e.t)}</span>{' '}
                <span className="text-term-ink-muted">{e.labels.pod}</span>{' '}
                {level === 'error' && <span className="font-bold text-term-error">error </span>}
                {f?.msg ?? e.line}
              </button>
              {traceId && onOpenTrace && (
                <button
                  type="button"
                  className={cx(
                    'shrink-0 rounded-sm px-1 text-term-ink underline underline-offset-2',
                    focusRing,
                  )}
                  aria-label={`Trace ${traceId.slice(0, 8)} for line ${String(i + 1)}`}
                  onClick={() => {
                    onOpenTrace(traceId, f.span_id)
                  }}
                >
                  Trace {traceId.slice(0, 8)}
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
