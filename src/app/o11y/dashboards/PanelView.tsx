import { useId, useState } from 'react'
import type { Simulator } from '@/sim/core/simulator'
import type { Annotation, Panel } from '@/sim/dashboards'
import { Button } from '../../ui/Button'
import { StatusPill } from '../../ui/StatusPill'
import { cx, focusRing } from '../../ui/styles'
import { clockTime, formatValue } from '../format'
import { TimeSeriesChart } from '../TimeSeriesChart'
import {
  crossed,
  latest,
  logsSummary,
  panelSummary,
  type LogRow,
  type PanelResult,
} from './panelData'

const SPAN = {
  3: 'lg:col-span-3',
  4: 'lg:col-span-4',
  6: 'lg:col-span-6',
  8: 'lg:col-span-8',
  12: 'lg:col-span-12',
} as const

/**
 * One dashboard panel (E8-02): its view (time series, stat, gauge, table or logs), a "View as table"
 * toggle, a sentence that says what it shows, and Explore to open its query in the PromQL explorer.
 */
export function PanelView({
  sim,
  panel: p,
  query,
  result,
  logs,
  annotations,
  range,
  onExplore,
}: {
  sim: Simulator
  panel: Panel
  query: string
  result: PanelResult
  logs?: LogRow[]
  annotations: Annotation[]
  range: [number, number]
  onExplore: (query: string) => void
}) {
  const id = useId()
  const [asTable, setAsTable] = useState(false)
  const epoch = sim.clock.epochMs
  const rows = latest(result)
  const summary =
    p.type === 'logs'
      ? logsSummary(p, logs ?? [], epoch)
      : p.type === 'timeseries'
        ? undefined
        : panelSummary(p, result)
  const value = rows[0]?.value
  const status = value === undefined || Number.isNaN(value) ? undefined : crossed(p, value)
  return (
    <section
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-desc`}
      className={cx(
        'col-span-12 grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-2 rounded-sm border border-line bg-surface p-3',
        SPAN[p.width],
      )}
    >
      <header className="flex flex-wrap items-start justify-between gap-2">
        <h3 id={`${id}-title`} className="font-bold">
          {p.title}
        </h3>
        <div className="flex flex-wrap gap-1">
          {p.type !== 'logs' && (
            <>
              <Button
                variant="ghost"
                aria-pressed={asTable}
                onClick={() => {
                  setAsTable((v) => !v)
                }}
              >
                View as table
              </Button>
              <Button
                variant="ghost"
                aria-label={`Explore: ${p.title}`}
                onClick={() => {
                  onExplore(query)
                }}
              >
                Explore
              </Button>
            </>
          )}
        </div>
      </header>
      <p id={`${id}-desc`} className="text-sm text-ink-muted">
        {p.description}
      </p>
      {!result.ok && p.type !== 'logs' ? (
        <p role="alert">The query didn’t run: {result.error}</p>
      ) : asTable ? (
        <PanelTable p={p} result={result} epochMs={epoch} />
      ) : p.type === 'timeseries' ? (
        <TimeSeriesChart
          series={result.ok ? result.series : []}
          unit={p.unit}
          epochMs={epoch}
          label={p.title}
          thresholds={p.thresholds ?? []}
          annotations={p.deploys ? annotations : []}
          range={range}
        />
      ) : p.type === 'stat' ? (
        <p className="flex flex-wrap items-baseline gap-3">
          <span className="text-4xl font-bold">
            {value === undefined || Number.isNaN(value) ? 'No data' : formatValue(value, p.unit)}
          </span>
          {status ? (
            <StatusPill status={status.status}>{status.label}</StatusPill>
          ) : value !== undefined && p.thresholds?.length ? (
            <StatusPill status="ok">Within limits</StatusPill>
          ) : null}
        </p>
      ) : p.type === 'gauge' ? (
        <div className="grid gap-2">
          <div
            role="meter"
            aria-label={p.title}
            aria-valuemin={0}
            aria-valuemax={p.max ?? 1}
            aria-valuenow={Number.isFinite(value) ? value : 0}
            aria-valuetext={value === undefined ? 'No data' : formatValue(value, p.unit)}
            className="h-4 overflow-hidden rounded-pill border border-line bg-raised"
          >
            <div
              className={cx(
                'h-full',
                status?.status === 'alert'
                  ? 'bg-alert'
                  : status?.status === 'warn'
                    ? 'bg-warn'
                    : 'bg-ok',
              )}
              style={{
                width: `${String(Math.min(100, Math.max(0, ((value ?? 0) / (p.max ?? 1)) * 100)))}%`,
              }}
            />
          </div>
          <p className="flex flex-wrap items-baseline gap-3">
            <span className="text-3xl font-bold">
              {value === undefined ? 'No data' : formatValue(value, p.unit)}
            </span>
            {status ? (
              <StatusPill status={status.status}>{status.label}</StatusPill>
            ) : (
              <StatusPill status="ok">Within limits</StatusPill>
            )}
          </p>
        </div>
      ) : p.type === 'logs' ? (
        (logs ?? []).length === 0 ? (
          <p>No error lines in this time range.</p>
        ) : (
          <ol
            aria-label={`${p.title}, newest first`}
            // It scrolls, so it must be keyboard-reachable.
            // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
            tabIndex={0}
            className={cx('grid max-h-72 gap-1 overflow-auto font-mono text-xs', focusRing)}
          >
            {(logs ?? []).map((l, i) => (
              <li key={i} className="[overflow-wrap:anywhere]">
                <span className="text-ink-muted">
                  {clockTime(epoch, l.t)} {l.pod}
                </span>{' '}
                {l.text}
              </li>
            ))}
          </ol>
        )
      ) : (
        <PanelTable p={p} result={result} epochMs={epoch} />
      )}
      {summary && <p className="text-sm [overflow-wrap:anywhere]">{summary}</p>}
    </section>
  )
}

function PanelTable({ p, result, epochMs }: { p: Panel; result: PanelResult; epochMs: number }) {
  if (!result.ok || result.series.length === 0) return <p>Nothing to show in this time range.</p>
  const last = result.series[0]?.points.at(-1)?.[0]
  return (
    <div
      // Long tables scroll inside the panel, so they must be keyboard-reachable.
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0}
      role="group"
      aria-label={`${p.title}: table`}
      className={cx('max-h-96 w-0 min-w-full overflow-auto', focusRing)}
    >
      <table className="w-full border-collapse text-left text-sm">
        <caption className="sr-only">{p.title}</caption>
        <thead>
          <tr className="border-b border-line">
            <th scope="col" className="p-2">
              Series
            </th>
            <th scope="col" className="p-2">
              Latest{last !== undefined ? ` (${clockTime(epochMs, last)})` : ''}
            </th>
            {p.type === 'timeseries' && (
              <>
                <th scope="col" className="p-2">
                  Lowest
                </th>
                <th scope="col" className="p-2">
                  Highest
                </th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {result.series.map((s) => {
            const vs = s.points.map(([, v]) => v).filter(Number.isFinite)
            return (
              <tr key={s.name} className="border-b border-line">
                <th scope="row" className="p-2 font-mono font-normal [overflow-wrap:anywhere]">
                  {s.name}
                </th>
                <td className="p-2">{formatValue(s.points.at(-1)?.[1] ?? NaN, p.unit)}</td>
                {p.type === 'timeseries' && (
                  <>
                    <td className="p-2">
                      {vs.length ? formatValue(Math.min(...vs), p.unit) : '—'}
                    </td>
                    <td className="p-2">
                      {vs.length ? formatValue(Math.max(...vs), p.unit) : '—'}
                    </td>
                  </>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
