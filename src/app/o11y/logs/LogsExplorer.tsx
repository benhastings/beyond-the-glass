import { useMemo, useState } from 'react'
import type { Simulator } from '@/sim/core/simulator'
import { logVolume, parseJsonLine, queryLogs } from '@/sim/logql/logql'
import { Button } from '../../ui/Button'
import { cx, focusRing } from '../../ui/styles'
import { clockTime } from '../format'
import { LogList } from './LogList'

const RANGES = [
  { id: '15m', label: 'Last 15 minutes', ms: 15 * 60_000 },
  { id: '1h', label: 'Last hour', ms: 3_600_000 },
  { id: '6h', label: 'Last 6 hours', ms: 6 * 3_600_000 },
] as const
/** A bucket's length in words: "15 seconds", "1 minute", "6 minutes". */
const bucketText = (ms: number) =>
  ms < 60_000
    ? `${String(Math.round(ms / 1000))} seconds`
    : ms === 60_000
      ? '1 minute'
      : `${String(Math.round(ms / 60_000))} minutes`
const field = cx('min-h-11 rounded-md border border-line bg-surface px-2', focusRing)

/**
 * The logs explorer (E8-04), after Grafana Explore with a Loki data source: a LogQL query, the log volume
 * over the time range, the lines (newest first), and a line's parsed fields. Trace IDs open the trace.
 */
export function LogsExplorer({
  sim,
  query: initial = '{namespace="ravenpost"} | json | level="error"',
  onOpenTrace,
  level = 2,
}: {
  sim: Simulator
  query?: string
  onOpenTrace?: (traceId: string, spanId?: string) => void
  level?: 2 | 3
}) {
  const H = `h${String(level)}` as 'h2' | 'h3'
  const [query, setQuery] = useState(initial)
  const [range, setRange] = useState<(typeof RANGES)[number]['id']>('1h')
  const [ran, setRan] = useState<{ query: string; range: string }>({ query: initial, range: '1h' })
  const [selected, setSelected] = useState<number>()
  const ms = RANGES.find((r) => r.id === ran.range)?.ms ?? 3_600_000
  const start = sim.now - ms
  const result = useMemo(() => {
    try {
      const entries = queryLogs(sim, ran.query, sim.now - ms, sim.now)
      return {
        ok: true as const,
        entries: [...entries].reverse(),
        volume: logVolume(entries, sim.now - ms, sim.now, 60),
      }
    } catch (e) {
      return { ok: false as const, error: (e as Error).message }
    }
  }, [sim, ran, ms])
  const chosen = result.ok && selected !== undefined ? result.entries[selected] : undefined
  const fields = chosen ? (chosen.fields ?? parseJsonLine(chosen.line)) : undefined
  const peak = result.ok
    ? result.volume.reduce((a, b) => (b.count > a.count ? b : a), { t: start, count: 0 })
    : undefined
  const maxCount = Math.max(1, peak?.count ?? 1)
  return (
    <section aria-label="Logs explorer" className="grid min-w-0 gap-4">
      <H className="text-xl font-bold">Explore logs</H>
      <form
        className="grid gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          setSelected(undefined)
          setRan({ query, range })
        }}
      >
        <label htmlFor="logql" className="font-bold">
          LogQL query
        </label>
        <input
          id="logql"
          className={cx(field, 'bg-term-ground font-mono text-sm text-term-ink')}
          spellCheck={false}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
          }}
        />
        <p className="text-sm text-ink-muted">
          Labels: cluster, namespace, pod, container, app. Filters: |= "text", != "text", |~
          "regex", then | json | level="error" or | duration_ms {'>'} 500.
        </p>
        <div className="flex flex-wrap items-end gap-3">
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
            Run query
          </Button>
        </div>
      </form>
      {!result.ok ? (
        <p role="alert" className="rounded-md border-2 border-alert p-3">
          <span className="font-bold">The query didn’t run.</span> {result.error}
        </p>
      ) : (
        <>
          <p role="status">
            {result.entries.length === 0
              ? 'No lines match in this time range.'
              : `${result.entries.length.toLocaleString('en')} ${result.entries.length === 1 ? 'line matches' : 'lines match'}, newest first.`}
          </p>
          <figure className="grid gap-1" aria-labelledby="log-volume-cap">
            <svg
              viewBox="0 0 600 60"
              className="h-16 w-full"
              aria-hidden="true"
              preserveAspectRatio="none"
            >
              {result.volume.map((b, k) => (
                <rect
                  key={k}
                  x={k * 10 + 1}
                  width={8}
                  y={60 - (b.count / maxCount) * 56}
                  height={(b.count / maxCount) * 56}
                  rx={1}
                  className="fill-info"
                />
              ))}
            </svg>
            <figcaption id="log-volume-cap" className="text-sm">
              Log volume, {clockTime(sim.clock.epochMs, start)}–
              {clockTime(sim.clock.epochMs, sim.now)}
              {peak && peak.count > 0
                ? `: busiest around ${clockTime(sim.clock.epochMs, peak.t)}, with ${String(peak.count)} lines in ${bucketText(ms / 60)}.`
                : '.'}
            </figcaption>
          </figure>
          {result.entries.length > 0 && (
            <LogList
              entries={result.entries}
              epochMs={sim.clock.epochMs}
              {...(selected !== undefined ? { selected } : {})}
              onSelect={(i) => {
                setSelected((s) => (s === i ? undefined : i))
              }}
              {...(onOpenTrace ? { onOpenTrace } : {})}
              label={`${result.entries.length.toLocaleString('en')} log lines`}
            />
          )}
          {chosen && (
            <section
              aria-label="Line details"
              className="grid gap-2 rounded-md border border-line p-3"
            >
              <p className="font-mono text-xs [overflow-wrap:anywhere]">{chosen.line}</p>
              <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm [overflow-wrap:anywhere]">
                {Object.entries(chosen.labels).map(([k, v]) => (
                  <Field key={`l-${k}`} term={k} value={v} />
                ))}
                {Object.entries(fields ?? {}).map(([k, v]) => (
                  <Field key={`f-${k}`} term={k} value={v} />
                ))}
              </dl>
              {fields?.trace_id && onOpenTrace && (
                <div>
                  <Button
                    onClick={() => {
                      onOpenTrace(fields.trace_id ?? '', fields.span_id)
                    }}
                  >
                    Open trace {fields.trace_id.slice(0, 8)}
                  </Button>
                </div>
              )}
            </section>
          )}
        </>
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
