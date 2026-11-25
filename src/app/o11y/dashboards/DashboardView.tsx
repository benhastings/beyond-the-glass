import { useMemo, useState } from 'react'
import type { Simulator } from '@/sim/core/simulator'
import {
  DASHBOARDS,
  deployAnnotations,
  interpolate,
  variableValues,
  windowSource,
} from '@/sim/dashboards'
import { Button } from '../../ui/Button'
import { cx, focusRing } from '../../ui/styles'
import { clockTime } from '../format'
import { PromqlExplorer } from '../PromqlExplorer'
import { errorLogs, runPanel } from './panelData'
import { PanelView } from './PanelView'

const RANGES = [
  { id: '15m', label: 'Last 15 minutes', ms: 15 * 60_000 },
  { id: '1h', label: 'Last hour', ms: 3_600_000 },
  { id: '6h', label: 'Last 6 hours', ms: 6 * 3_600_000 },
  { id: 'custom', label: 'Custom…', ms: 0 },
] as const

const select = cx('min-h-11 rounded-md border border-line bg-surface px-2', focusRing)

/**
 * Grafana-style dashboards over the simulation (E8-02): pick a dashboard, its variables and a time range;
 * panels sit in a grid. The layout evokes Grafana's, with no Grafana logo or branding. Refresh re-reads the
 * simulation (its time may have moved on).
 */
export function DashboardView({
  sim,
  initial = 'service-overview',
}: {
  sim: Simulator
  initial?: string
}) {
  const [id, setId] = useState(initial)
  const [range, setRange] = useState<(typeof RANGES)[number]['id']>('1h')
  const [custom, setCustom] = useState({ from: 60, to: 0 })
  const [vars, setVars] = useState<Record<string, string>>({ service: '', namespace: '' })
  const [now, setNow] = useState(sim.now)
  const [exploring, setExploring] = useState<string>()
  const d = DASHBOARDS.find((x) => x.id === id) ?? DASHBOARDS[0]
  const span = RANGES.find((r) => r.id === range)?.ms ?? 3_600_000
  const start = range === 'custom' ? now - custom.from * 60_000 : now - span
  const end = range === 'custom' ? now - custom.to * 60_000 : now
  const data = useMemo(() => {
    const src = windowSource(sim, start, end)
    const choices = Object.fromEntries(
      (d?.variables ?? []).map((v) => [
        v.name,
        variableValues(src, v.from.metric, v.from.label, start, end),
      ]),
    )
    const panels = (d?.panels ?? []).map((p) => {
      const query = interpolate(p.query, vars)
      return {
        panel: p,
        query,
        result:
          p.type === 'logs' ? { ok: true as const, series: [] } : runPanel(src, query, start, end),
        ...(p.type === 'logs' ? { logs: errorLogs(sim, vars.namespace ?? '', start, end) } : {}),
      }
    })
    return { choices, panels, annotations: deployAnnotations(sim, start, end) }
    // `start` and `end` follow `now`, which Refresh moves to the simulation's time.
  }, [sim, d, start, end, vars])
  if (!d) return null
  if (exploring !== undefined)
    return (
      <div className="grid gap-3">
        <div>
          <Button
            variant="ghost"
            onClick={() => {
              setExploring(undefined)
            }}
          >
            ← Back to {d.title}
          </Button>
        </div>
        <PromqlExplorer sim={sim} initialQuery={exploring} level={3} />
      </div>
    )
  return (
    <section aria-label={`Dashboard: ${d.title}`} className="grid min-w-0 gap-3">
      <div className="flex flex-wrap items-end gap-3 rounded-sm border border-line bg-raised p-2">
        <label className="grid gap-1 text-sm">
          Dashboard
          <select
            className={select}
            value={id}
            onChange={(e) => {
              setId(e.target.value)
            }}
          >
            {DASHBOARDS.map((x) => (
              <option key={x.id} value={x.id}>
                {x.title}
              </option>
            ))}
          </select>
        </label>
        {d.variables.map((v) => (
          <label key={v.name} className="grid gap-1 text-sm">
            {v.label}
            <select
              className={select}
              value={vars[v.name] ?? ''}
              onChange={(e) => {
                setVars((x) => ({ ...x, [v.name]: e.target.value }))
              }}
            >
              <option value="">All</option>
              {(data.choices[v.name] ?? []).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        ))}
        <span className="grow" />
        <label className="grid gap-1 text-sm">
          Time range
          <select
            className={select}
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
        {range === 'custom' && (
          <>
            <label className="grid gap-1 text-sm">
              From (minutes ago)
              <input
                type="number"
                min={1}
                max={720}
                className={cx(select, 'w-28')}
                value={custom.from}
                onChange={(e) => {
                  setCustom((c) => ({
                    ...c,
                    from: Math.max(c.to + 1, Number(e.target.value) || 1),
                  }))
                }}
              />
            </label>
            <label className="grid gap-1 text-sm">
              To (minutes ago)
              <input
                type="number"
                min={0}
                max={719}
                className={cx(select, 'w-28')}
                value={custom.to}
                onChange={(e) => {
                  setCustom((c) => ({
                    ...c,
                    to: Math.min(c.from - 1, Math.max(0, Number(e.target.value) || 0)),
                  }))
                }}
              />
            </label>
          </>
        )}
        <Button
          onClick={() => {
            setNow(sim.now)
          }}
        >
          Refresh
        </Button>
      </div>
      <h2 className="text-xl font-bold">{d.title}</h2>
      <p className="max-w-prose text-sm">
        {d.description} Showing {clockTime(sim.clock.epochMs, start)}–
        {clockTime(sim.clock.epochMs, end)}.
      </p>
      <div className="grid grid-cols-12 gap-3">
        {data.panels.map((x) => (
          <PanelView
            key={`${d.id}/${x.panel.id}`}
            sim={sim}
            panel={x.panel}
            query={x.query}
            result={x.result}
            {...(x.logs ? { logs: x.logs } : {})}
            annotations={data.annotations}
            range={[start, end]}
            onExplore={setExploring}
          />
        ))}
      </div>
    </section>
  )
}
