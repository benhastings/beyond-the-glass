import { useMemo, useState } from 'react'
import type { Simulator } from '@/sim/core/simulator'
import { services } from '@/sim/telemetry/model'
import { trace as findTrace, type Span } from '@/sim/telemetry/traces'
import { formQuery, searchTraces } from '@/sim/traceql/traceql'
import { Button } from '../../ui/Button'
import { StatusPill } from '../../ui/StatusPill'
import { cx, focusRing } from '../../ui/styles'
import { clockTime, formatValue } from '../format'
import { TraceView } from './TraceView'

const RANGES = [
  { id: '15m', label: 'Last 15 minutes', ms: 15 * 60_000 },
  { id: '1h', label: 'Last hour', ms: 3_600_000 },
  { id: '6h', label: 'Last 6 hours', ms: 6 * 3_600_000 },
] as const
const field = cx('min-h-11 rounded-md border border-line bg-surface px-2', focusRing)

/**
 * The trace explorer (E8-05), after Grafana Explore with a Tempo data source: a search form that writes
 * TraceQL, the TraceQL itself, matching traces, and the chosen trace's waterfall.
 */
export function TraceExplorer({
  sim,
  open,
  onLogsForSpan,
  level = 2,
}: {
  sim: Simulator
  /** A trace (and span) to open first: from a log line or an exemplar. */
  open?: { traceId: string; spanId?: string }
  onLogsForSpan?: (span: Span) => void
  level?: 2 | 3
}) {
  const H = `h${String(level)}` as 'h2' | 'h3'
  const [form, setForm] = useState({
    service: '',
    name: '',
    status: '' as '' | 'error' | 'ok' | 'unset',
    min: '',
    max: '',
  })
  const [range, setRange] = useState<(typeof RANGES)[number]['id']>('15m')
  const [query, setQuery] = useState('{ status = error }')
  const [ran, setRan] = useState<{ query: string; range: string }>({ query, range })
  const [chosen, setChosen] = useState(open)
  const result = useMemo(() => {
    const ms = RANGES.find((r) => r.id === ran.range)?.ms ?? 900_000
    try {
      return { ok: true as const, matches: searchTraces(sim, ran.query, sim.now - ms, sim.now) }
    } catch (e) {
      return { ok: false as const, error: (e as Error).message }
    }
  }, [sim, ran])
  const shown = chosen ? findTrace(sim, chosen.traceId) : undefined
  const fromForm = () =>
    formQuery({
      service: form.service,
      name: form.name,
      status: form.status,
      ...(form.min ? { minMs: Number(form.min) } : {}),
      ...(form.max ? { maxMs: Number(form.max) } : {}),
    })
  return (
    <section aria-label="Trace explorer" className="grid min-w-0 gap-4">
      <H className="text-xl font-bold">Explore traces</H>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          const q = fromForm()
          setQuery(q)
          setRan({ query: q, range })
        }}
      >
        <label className="grid gap-1 text-sm">
          Service
          <select
            className={field}
            value={form.service}
            onChange={(e) => {
              setForm((f) => ({ ...f, service: e.target.value }))
            }}
          >
            <option value="">Any</option>
            {services(sim).map((s) => (
              <option key={s.name}>{s.name}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          Span name
          <input
            className={field}
            value={form.name}
            onChange={(e) => {
              setForm((f) => ({ ...f, name: e.target.value }))
            }}
          />
        </label>
        <label className="grid gap-1 text-sm">
          Status
          <select
            className={field}
            value={form.status}
            onChange={(e) => {
              setForm((f) => ({ ...f, status: e.target.value as typeof f.status }))
            }}
          >
            <option value="">Any</option>
            <option value="error">Error</option>
            <option value="unset">OK</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          Slower than (ms)
          <input
            type="number"
            min={0}
            className={cx(field, 'w-28')}
            value={form.min}
            onChange={(e) => {
              setForm((f) => ({ ...f, min: e.target.value }))
            }}
          />
        </label>
        <label className="grid gap-1 text-sm">
          Faster than (ms)
          <input
            type="number"
            min={0}
            className={cx(field, 'w-28')}
            value={form.max}
            onChange={(e) => {
              setForm((f) => ({ ...f, max: e.target.value }))
            }}
          />
        </label>
        <label className="grid gap-1 text-sm">
          Time range
          <select
            className={field}
            value={range}
            onChange={(e) => {
              setRange(e.target.value as typeof range)
            }}
          >
            {RANGES.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" variant="primary">
          Search
        </Button>
      </form>
      <form
        className="grid gap-1"
        onSubmit={(e) => {
          e.preventDefault()
          setRan({ query, range })
        }}
      >
        <label htmlFor="traceql" className="font-bold">
          TraceQL
        </label>
        <div className="flex flex-wrap gap-2">
          <input
            id="traceql"
            className={cx(field, 'min-w-0 grow bg-term-ground font-mono text-sm text-term-ink')}
            spellCheck={false}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
            }}
          />
          <Button type="submit">Run TraceQL</Button>
        </div>
        <p className="text-sm text-ink-muted">
          For example: {'{ resource.service.name = "api" } >> { status = error }'}, or{' '}
          {'{ duration > 500ms }'}.
        </p>
      </form>
      {result.ok ? (
        <div className="grid gap-2">
          <p role="status">
            {result.matches.length === 0
              ? 'No traces match in this time range.'
              : `${String(result.matches.length)} trace${result.matches.length === 1 ? '' : 's'} match, newest first.`}
          </p>
          {result.matches.length > 0 && (
            <div
              className={cx('max-h-80 w-0 min-w-full overflow-auto', focusRing)}
              role="group"
              aria-label="Matching traces"
              // It scrolls, so it must be keyboard-reachable.
              // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
              tabIndex={0}
            >
              <table className="w-full border-collapse text-left text-sm">
                <caption className="sr-only">Traces matching {ran.query}</caption>
                <thead>
                  <tr className="border-b border-line">
                    {['Trace', 'Started', 'Root', 'Duration', 'Matching spans', 'Status'].map(
                      (h) => (
                        <th key={h} scope="col" className="p-2">
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {result.matches.map((m) => (
                    <tr key={m.trace.traceId} className="border-b border-line">
                      <th scope="row" className="p-2 font-normal">
                        <Button
                          variant="ghost"
                          aria-label={`Open trace ${m.trace.traceId.slice(0, 8)}`}
                          onClick={() => {
                            setChosen({
                              traceId: m.trace.traceId,
                              ...(m.spans[0] ? { spanId: m.spans[0].spanId } : {}),
                            })
                          }}
                        >
                          <span className="font-mono">{m.trace.traceId.slice(0, 8)}</span>
                        </Button>
                      </th>
                      <td className="p-2">{clockTime(sim.clock.epochMs, m.trace.start)}</td>
                      <td className="p-2">{m.trace.rootService}</td>
                      <td className="p-2">{formatValue(m.trace.durationMs / 1000, 'seconds')}</td>
                      <td className="p-2">{m.spans.map((s) => s.service).join(', ')}</td>
                      <td className="p-2">
                        {m.trace.error ? (
                          <StatusPill status="alert">Errors</StatusPill>
                        ) : (
                          <StatusPill status="ok">OK</StatusPill>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <p role="alert" className="rounded-md border-2 border-alert p-3">
          <span className="font-bold">The query didn’t run.</span> {result.error}
        </p>
      )}
      {chosen && !shown && (
        <p role="alert">There’s no trace {chosen.traceId} in this simulation.</p>
      )}
      {shown && (
        <TraceView
          key={`${shown.traceId}/${chosen?.spanId ?? ''}`}
          trace={shown}
          epochMs={sim.clock.epochMs}
          {...(chosen?.spanId ? { highlight: chosen.spanId } : {})}
          {...(onLogsForSpan ? { onLogsForSpan } : {})}
          level={level === 2 ? 3 : 4}
        />
      )}
    </section>
  )
}
