import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import type { Span, Trace } from '@/sim/telemetry/traces'
import { Button } from '../../ui/Button'
import { StatusPill } from '../../ui/StatusPill'
import { Tabs } from '../../ui/Tabs'
import { cx, focusRing } from '../../ui/styles'
import { clockTime, formatValue } from '../format'
import '../chart.css'

interface Row {
  span: Span
  depth: number
  parent?: string
  children: string[]
  posInSet: number
  setSize: number
}

/** Spans in tree order, with their place in the tree. */
export function spanRows(t: Trace): Row[] {
  const kids = new Map<string, Span[]>()
  const ids = new Set(t.spans.map((s) => s.spanId))
  const roots: Span[] = []
  for (const s of t.spans) {
    if (s.parentSpanId && ids.has(s.parentSpanId))
      kids.set(s.parentSpanId, [...(kids.get(s.parentSpanId) ?? []), s])
    else roots.push(s)
  }
  const out: Row[] = []
  const walk = (s: Span, depth: number, pos: number, size: number) => {
    const children = [...(kids.get(s.spanId) ?? [])].sort((a, b) => a.start - b.start)
    out.push({
      span: s,
      depth,
      ...(s.parentSpanId && ids.has(s.parentSpanId) ? { parent: s.parentSpanId } : {}),
      children: children.map((c) => c.spanId),
      posInSet: pos,
      setSize: size,
    })
    children.forEach((c, i) => {
      walk(c, depth + 1, i + 1, children.length)
    })
  }
  roots
    .sort((a, b) => a.start - b.start)
    .forEach((r, i) => {
      walk(r, 1, i + 1, roots.length)
    })
  return out
}

const isError = (s: Span) => s.status.code === 'STATUS_CODE_ERROR'
const ms = (v: number) => formatValue(v / 1000, 'seconds')
/** Time a span spent itself, not waiting on the spans it called: what makes a span "the slow one". */
export const selfTime = (row: Row, rows: Row[]) =>
  row.span.end -
  row.span.start -
  row.children.reduce((n, c) => {
    const k = rows.find((r) => r.span.spanId === c)?.span
    return n + (k ? k.end - k.start : 0)
  }, 0)

/**
 * One trace (E8-05): a waterfall that is a WAI-ARIA tree (Up/Down, Right/Left to open and close, Home/End,
 * Enter to show a span), a table with the same spans, the call path between services, and the chosen
 * span's attributes, events and status. S jumps to the slowest span, E to the next error.
 */
export function TraceView({
  trace: t,
  epochMs,
  highlight,
  onLogsForSpan,
  level = 3,
}: {
  trace: Trace
  epochMs: number
  /** A span to show first (from a log line). */
  highlight?: string
  onLogsForSpan?: (span: Span) => void
  level?: 2 | 3 | 4
}) {
  const id = useId()
  const H = `h${String(level)}` as 'h2' | 'h3' | 'h4'
  const Sub = `h${String(level + 1)}` as 'h3' | 'h4' | 'h5'
  const rows = useMemo(() => spanRows(t), [t])
  const services = useMemo(() => [...new Set(rows.map((r) => r.span.service))], [rows])
  const [selected, setSelected] = useState(highlight ?? rows[0]?.span.spanId ?? '')
  const [focus, setFocus] = useState(highlight ?? rows[0]?.span.spanId ?? '')
  const [closed, setClosed] = useState<ReadonlySet<string>>(new Set())
  const [notice, setNotice] = useState('')
  const refs = useRef(new Map<string, HTMLDivElement>())
  const t0 = Math.min(...t.spans.map((s) => s.start))
  const total = Math.max(1, Math.max(...t.spans.map((s) => s.end)) - t0)
  const visible = useMemo(() => {
    const hidden = new Set<string>()
    return rows.filter((r) => {
      if (r.parent && (closed.has(r.parent) || hidden.has(r.parent))) {
        hidden.add(r.span.spanId)
        return false
      }
      return true
    })
  }, [rows, closed])
  const span = rows.find((r) => r.span.spanId === selected)?.span
  const errors = rows.filter((r) => isError(r.span))
  const slowest = rows.reduce<Row | undefined>(
    (a, r) => (!a || selfTime(r, rows) > selfTime(a, rows) ? r : a),
    undefined,
  )
  const edges = [
    ...new Set(
      rows
        .filter((r) => r.parent)
        .map(
          (r) =>
            `${rows.find((p) => p.span.spanId === r.parent)?.span.service ?? '?'} → ${r.span.service}`,
        ),
    ),
  ]
  const color = (svc: string) => `var(--series-${String((services.indexOf(svc) % 8) + 1)})`

  const go = (spanId: string, why = '') => {
    // Open every ancestor so the span can be seen.
    const open = new Set(closed)
    let parent = rows.find((x) => x.span.spanId === spanId)?.parent
    while (parent) {
      open.delete(parent)
      const p = parent
      parent = rows.find((x) => x.span.spanId === p)?.parent
    }
    setClosed(open)
    setSelected(spanId)
    setFocus(spanId)
    if (why) setNotice(why)
    requestAnimationFrame(() => refs.current.get(spanId)?.focus())
  }
  const toSlowest = () => {
    if (slowest)
      go(
        slowest.span.spanId,
        `Slowest span: ${slowest.span.service} ${slowest.span.name}, ${ms(selfTime(slowest, rows))} of its own time.`,
      )
  }
  const toNextError = () => {
    const at = rows.findIndex((x) => x.span.spanId === selected)
    const nextErr = errors.find((r) => rows.indexOf(r) > at) ?? errors[0]
    if (!nextErr) {
      setNotice('No spans in this trace have errors.')
      return
    }
    go(
      nextErr.span.spanId,
      `Error ${String(errors.indexOf(nextErr) + 1)} of ${String(errors.length)}: ${nextErr.span.service} ${nextErr.span.name}: ${nextErr.span.status.message ?? 'error'}.`,
    )
  }
  const onShortcut = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.ctrlKey || e.metaKey || e.altKey) return
    const k = e.key.toLowerCase()
    if (k !== 's' && k !== 'e') return
    e.preventDefault()
    if (k === 's') toSlowest()
    else toNextError()
  }
  const onTreeKey = (e: KeyboardEvent, r: Row, i: number) => {
    const open = r.children.length > 0 && !closed.has(r.span.spanId)
    const move = (sid: string | undefined) => {
      if (!sid) return
      setFocus(sid)
      refs.current.get(sid)?.focus()
    }
    const toggle = (v: boolean) => {
      setClosed((c) => {
        const n = new Set(c)
        if (v) n.delete(r.span.spanId)
        else n.add(r.span.spanId)
        return n
      })
    }
    switch (e.key) {
      case 'ArrowDown':
        move(visible[i + 1]?.span.spanId)
        break
      case 'ArrowUp':
        move(visible[i - 1]?.span.spanId)
        break
      case 'Home':
        move(visible[0]?.span.spanId)
        break
      case 'End':
        move(visible.at(-1)?.span.spanId)
        break
      case 'ArrowRight':
        if (r.children.length && !open) toggle(true)
        else if (open) move(r.children[0])
        break
      case 'ArrowLeft':
        if (open) toggle(false)
        else move(r.parent)
        break
      case 'Enter':
      case ' ':
        setSelected(r.span.spanId)
        break
      default:
        return
    }
    e.preventDefault()
  }

  return (
    // The shortcuts work anywhere inside the trace view.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <section
      aria-labelledby={`${id}-title`}
      className="viz grid min-w-0 gap-3"
      onKeyDown={onShortcut}
    >
      <H id={`${id}-title`} className="flex flex-wrap items-center gap-3 text-lg font-bold">
        <span>
          Trace <code className="font-mono text-sm">{t.traceId}</code>
        </span>
        {t.error ? (
          <StatusPill status="alert">Errors</StatusPill>
        ) : (
          <StatusPill status="ok">No errors</StatusPill>
        )}
      </H>
      <p className="text-sm">
        {t.rootService}: {rows[0]?.span.name} at {clockTime(epochMs, t.start)}, {ms(total)},{' '}
        {t.spans.length} spans
        {errors.length ? `, ${String(errors.length)} with errors` : ''}.
      </p>
      <p id={`${id}-keys`} className="text-sm text-ink-muted">
        Shortcuts: press <kbd className="font-mono">S</kbd> for the slowest span,{' '}
        <kbd className="font-mono">E</kbd> for the next error.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" onClick={toSlowest}>
          Slowest span (S)
        </Button>
        <Button variant="ghost" disabled={errors.length === 0} onClick={toNextError}>
          Next error (E)
        </Button>
      </div>
      <p role="status" className="min-h-6 text-sm">
        {notice}
      </p>
      <div>
        <Sub className="font-bold">Call path</Sub>
        <ul className="flex flex-wrap gap-x-4 text-sm" aria-label="Services this trace called">
          {edges.length ? (
            edges.map((e) => (
              <li key={e} className="font-mono">
                {e}
              </li>
            ))
          ) : (
            <li>{t.rootService} only</li>
          )}
        </ul>
      </div>
      <Tabs
        label="Trace views"
        items={[
          {
            id: 'waterfall',
            label: 'Waterfall',
            content: (
              <div
                role="tree"
                aria-label={`Spans of trace ${t.traceId}`}
                aria-describedby={`${id}-keys`}
                className="grid gap-0.5"
              >
                {visible.map((r, i) => {
                  const s = r.span
                  const left = ((s.start - t0) / total) * 100
                  const width = Math.max(0.5, ((s.end - s.start) / total) * 100)
                  const open = r.children.length > 0 && !closed.has(s.spanId)
                  return (
                    <div
                      key={s.spanId}
                      ref={(el) => {
                        if (el) refs.current.set(s.spanId, el)
                        else refs.current.delete(s.spanId)
                      }}
                      role="treeitem"
                      aria-level={r.depth}
                      aria-setsize={r.setSize}
                      aria-posinset={r.posInSet}
                      aria-selected={selected === s.spanId}
                      {...(r.children.length ? { 'aria-expanded': open } : {})}
                      tabIndex={s.spanId === focus ? 0 : -1}
                      onKeyDown={(e) => {
                        onTreeKey(e, r, i)
                      }}
                      onClick={() => {
                        setFocus(s.spanId)
                        setSelected(s.spanId)
                      }}
                      onFocus={() => {
                        setFocus(s.spanId)
                      }}
                      className={cx(
                        'grid cursor-pointer grid-cols-[minmax(10rem,2fr)_3fr] items-center gap-2 rounded-sm px-1 py-0.5 text-sm',
                        selected === s.spanId && 'bg-raised',
                        focusRing,
                      )}
                    >
                      <span
                        className="flex min-w-0 items-center gap-1"
                        style={{ paddingInlineStart: `${String((r.depth - 1) * 1)}rem` }}
                      >
                        <span aria-hidden="true" className="w-3 shrink-0">
                          {r.children.length ? (open ? '▾' : '▸') : ''}
                        </span>
                        <span className="truncate">
                          <span className="font-bold">{s.service}</span> {s.name}
                        </span>{' '}
                        {isError(s) && (
                          <span className="shrink-0 font-bold text-alert">● Error</span>
                        )}{' '}
                      </span>{' '}
                      <span className="relative h-5">
                        <span
                          aria-hidden="true"
                          className="absolute top-1 h-3 rounded-sm"
                          style={{
                            left: `${String(left)}%`,
                            width: `${String(width)}%`,
                            background: color(s.service),
                          }}
                        />
                        <span
                          className="absolute top-0 text-xs"
                          style={{
                            left: `${String(Math.min(left + width, 85))}%`,
                            paddingInlineStart: '0.25rem',
                          }}
                        >
                          {ms(s.end - s.start)}
                        </span>
                      </span>
                    </div>
                  )
                })}
              </div>
            ),
          },
          {
            id: 'table',
            label: 'Table',
            content: (
              <div className="w-0 min-w-full overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm">
                  <caption className="sr-only">Spans of trace {t.traceId}</caption>
                  <thead>
                    <tr className="border-b border-line">
                      {['Span', 'Service', 'Starts after', 'Duration', 'Status'].map((h) => (
                        <th key={h} scope="col" className="p-2">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.span.spanId} className="border-b border-line">
                        <th scope="row" className="p-2 font-normal">
                          <Button
                            variant="ghost"
                            aria-label={`${r.span.name} (${r.span.service}): details`}
                            onClick={() => {
                              setSelected(r.span.spanId)
                            }}
                          >
                            {'· '.repeat(r.depth - 1)}
                            {r.span.name}
                          </Button>
                        </th>
                        <td className="p-2">{r.span.service}</td>
                        <td className="p-2">{ms(r.span.start - t0)}</td>
                        <td className="p-2">{ms(r.span.end - r.span.start)}</td>
                        <td className="p-2">
                          {isError(r.span) ? (
                            <StatusPill status="alert">Error</StatusPill>
                          ) : (
                            <StatusPill status="ok">OK</StatusPill>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ),
          },
        ]}
      />
      {span && (
        <section
          aria-label={`Span ${span.name} (${span.service})`}
          className="grid gap-2 rounded-md border border-line p-3"
        >
          <Sub className="font-bold">
            {span.service}: {span.name}
          </Sub>
          <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm [overflow-wrap:anywhere]">
            <dt className="text-ink-muted">Span ID</dt>
            <dd className="font-mono">{span.spanId}</dd>
            <dt className="text-ink-muted">Duration</dt>
            <dd>{ms(span.end - span.start)}</dd>
            <dt className="text-ink-muted">Status</dt>
            <dd>{isError(span) ? `Error: ${span.status.message ?? ''}` : 'OK'}</dd>
            <dt className="text-ink-muted">Kind</dt>
            <dd>{span.kind.replace('SPAN_KIND_', '').toLowerCase()}</dd>
            {Object.entries(span.attributes).map(([k, v]) => (
              <Field key={`a-${k}`} term={`span.${k}`} value={String(v)} />
            ))}
            <Field term="resource.service.name" value={span.service} />
            <Field term="resource.k8s.namespace.name" value={span.namespace} />
            {span.pod && <Field term="resource.k8s.pod.name" value={span.pod} />}
            {span.events.map((e, i) => (
              <Field
                key={`e-${String(i)}`}
                term={`event: ${e.name}`}
                value={Object.values(e.attributes).join(' — ')}
              />
            ))}
          </dl>
          {onLogsForSpan && span.pod && (
            <div>
              <Button
                onClick={() => {
                  onLogsForSpan(span)
                }}
              >
                Logs for this span
              </Button>
            </div>
          )}
        </section>
      )}
    </section>
  )
}

function Field({ term, value }: { term: string; value: string }) {
  return (
    <>
      <dt className="font-mono text-ink-muted">{term}</dt>
      <dd className="font-mono">{value}</dd>
    </>
  )
}
