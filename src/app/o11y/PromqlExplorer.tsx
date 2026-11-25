import { useMemo, useState } from 'react'
import type { Simulator } from '@/sim/core/simulator'
import {
  AGGREGATIONS,
  FUNCTIONS,
  rangeQuery,
  STARTER_QUERIES,
  telemetrySource,
  type RangeResult,
} from '@/sim/promql'
import { FAMILIES } from '@/sim/telemetry/metrics'
import { Button } from '../ui/Button'
import { Tabs } from '../ui/Tabs'
import { clockTime, formatValue, unitFor } from './format'
import { QueryEditor, type Suggestion } from './QueryEditor'
import { TimeSeriesChart } from './TimeSeriesChart'

const RANGES = [
  { id: '15m', label: 'Last 15 minutes', ms: 15 * 60_000 },
  { id: '1h', label: 'Last hour', ms: 3_600_000 },
  { id: '6h', label: 'Last 6 hours', ms: 6 * 3_600_000 },
] as const

const SUGGESTIONS: Suggestion[] = [
  ...FAMILIES.map((f) => ({ text: f.name, kind: 'metric' as const, detail: f.type })),
  ...[...new Set(FAMILIES.flatMap((f) => f.labels))].map((l) => ({
    text: l,
    kind: 'label' as const,
  })),
  ...[...FUNCTIONS, ...AGGREGATIONS, 'by', 'without', 'offset', 'ignoring', 'on'].map((f) => ({
    text: f,
    kind: 'function' as const,
  })),
]

/** `{service="gate", le="0.5"}`: a series' labels, as Prometheus prints them. */
export const seriesName = (labels: Record<string, string>) => {
  const { __name__: name = '', ...rest } = labels
  const inner = Object.entries(rest)
    .filter(([k]) => k !== 'cluster')
    .map(([k, v]) => `${k}="${v}"`)
    .join(', ')
  return `${name}${inner ? `{${inner}}` : name ? '' : '{}'}`
}

/**
 * The PromQL explorer (E8-03): a query field with autocomplete, a time range, the result as a graph or a
 * table, and starter queries with plain-English explanations. Queries run against the simulation's
 * telemetry (E8-01).
 */
export function PromqlExplorer({
  sim,
  initialQuery = STARTER_QUERIES[0]?.query ?? '',
  level = 2,
}: {
  sim: Simulator
  initialQuery?: string
  level?: 2 | 3
}) {
  const H = `h${String(level)}` as 'h2' | 'h3'
  const [query, setQuery] = useState(initialQuery)
  const [range, setRange] = useState<(typeof RANGES)[number]['id']>('1h')
  const [ran, setRan] = useState<{ query: string; range: string }>({
    query: initialQuery,
    range: '1h',
  })
  const result = useMemo((): { ok: true; r: RangeResult } | { ok: false; error: string } => {
    const ms = RANGES.find((r) => r.id === ran.range)?.ms ?? 3_600_000
    const end = sim.now
    const step = Math.max(15_000, Math.round(ms / 120 / 15_000) * 15_000)
    try {
      return { ok: true, r: rangeQuery(telemetrySource(sim), ran.query, end - ms, end, step) }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  }, [sim, ran])
  const run = (q = query) => {
    setRan({ query: q, range })
  }
  const unit = unitFor(ran.query)
  const series = result.ok
    ? result.r.series.map((s) => ({ name: seriesName(s.labels) || 'value', points: s.points }))
    : []
  return (
    <section aria-label="PromQL explorer" className="grid min-w-0 gap-4">
      <H className="text-xl font-bold">Explore metrics</H>
      <QueryEditor
        label="PromQL query"
        value={query}
        onChange={setQuery}
        onRun={run}
        suggestions={SUGGESTIONS}
      />
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1">
          Time range
          <select
            className="min-h-11 rounded-md border border-line bg-surface px-2"
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
        <Button
          variant="primary"
          onClick={() => {
            run()
          }}
        >
          Run query
        </Button>
      </div>
      {result.ok ? (
        <Tabs
          label="Result views"
          items={[
            {
              id: 'graph',
              label: 'Graph',
              content: (
                <TimeSeriesChart
                  series={series}
                  unit={unit}
                  epochMs={sim.clock.epochMs}
                  label={`Result of ${ran.query}`}
                />
              ),
            },
            {
              id: 'table',
              label: 'Table',
              content: series.length ? (
                <div className="w-0 min-w-full overflow-x-auto">
                  <table className="w-full border-collapse text-left text-sm">
                    <caption className="sr-only">Result of {ran.query}</caption>
                    <thead>
                      <tr className="border-b border-line">
                        {[
                          'Series',
                          `Latest (${series[0]?.points.at(-1) ? clockTime(sim.clock.epochMs, series[0].points.at(-1)?.[0] ?? 0) : ''})`,
                          'Lowest',
                          'Highest',
                        ].map((h) => (
                          <th key={h} scope="col" className="p-2">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {series.map((s) => {
                        const vs = s.points.map(([, v]) => v).filter(Number.isFinite)
                        return (
                          <tr key={s.name} className="border-b border-line">
                            <th
                              scope="row"
                              className="p-2 font-mono font-normal [overflow-wrap:anywhere]"
                            >
                              {s.name}
                            </th>
                            <td className="p-2">
                              {formatValue(s.points.at(-1)?.[1] ?? NaN, unit)}
                            </td>
                            <td className="p-2">
                              {vs.length ? formatValue(Math.min(...vs), unit) : '—'}
                            </td>
                            <td className="p-2">
                              {vs.length ? formatValue(Math.max(...vs), unit) : '—'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p>No series match this query in this time range.</p>
              ),
            },
          ]}
        />
      ) : (
        <p role="alert" className="rounded-md border-2 border-alert p-3">
          <span className="font-bold">The query didn’t run.</span> {result.error}
        </p>
      )}
      <details open className="grid gap-2">
        <summary className="cursor-pointer font-bold">Starter queries</summary>
        <ul className="mt-2 grid gap-3">
          {STARTER_QUERIES.map((q) => (
            <li key={q.id} className="grid gap-1 rounded-md border border-line p-3">
              <p className="font-bold">{q.title}</p>
              <code className="font-mono text-sm [overflow-wrap:anywhere]">{q.query}</code>
              <p className="text-sm">{q.explanation}</p>
              <div>
                <Button
                  variant="ghost"
                  aria-label={`Run this query: ${q.title}`}
                  onClick={() => {
                    setQuery(q.query)
                    run(q.query)
                  }}
                >
                  Run this query
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </details>
    </section>
  )
}
