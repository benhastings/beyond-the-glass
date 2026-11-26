import type { Simulator } from '@/sim/core/simulator'
import { lowerIsWorse, type Panel, type Threshold } from '@/sim/dashboards'
import type { RawSeries, SeriesSource } from '@/sim/promql'
import { rangeQuery } from '@/sim/promql'
import { logsInWindow } from '@/sim/telemetry/logs'
import { tracesInWindow } from '@/sim/telemetry/traces'
import { clockTime, formatValue } from '../format'
import { seriesName } from '../PromqlExplorer'

export type PanelResult =
  | { ok: true; series: { name: string; points: [number, number][] }[] }
  | { ok: false; error: string }

/** A panel's query over the dashboard's window. */
export function runPanel(
  src: SeriesSource,
  query: string,
  start: number,
  end: number,
): PanelResult {
  const step = Math.max(15_000, Math.round((end - start) / 240 / 15_000) * 15_000)
  try {
    const r = rangeQuery(src, query, start, end, step)
    return {
      ok: true,
      series: r.series.map((s: RawSeries) => ({
        name: seriesName(s.labels) || 'value',
        points: s.points,
      })),
    }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/** The worst threshold a value crosses, if any. */
export function crossed(p: Panel, v: number): Threshold | undefined {
  const lower = lowerIsWorse(p)
  return [...(p.thresholds ?? [])]
    .sort((a, b) => (lower ? a.value - b.value : b.value - a.value))
    .find((t) => (lower ? v < t.value : v >= t.value))
}

export const latest = (r: PanelResult) =>
  r.ok ? r.series.map((s) => ({ name: s.name, value: s.points.at(-1)?.[1] ?? NaN })) : []

/** The sentence every panel carries (E8-02.AC1), for the types that aren't charts. */
export function panelSummary(p: Panel, r: PanelResult): string {
  if (!r.ok) return `${p.title}: the query didn’t run (${r.error}).`
  const rows = latest(r)
  if (p.type === 'stat' || p.type === 'gauge') {
    const v = rows[0]?.value
    if (v === undefined || Number.isNaN(v)) return `${p.title}: no data.`
    const t = crossed(p, v)
    const share = p.type === 'gauge' && p.max ? ` of ${formatValue(p.max, p.unit)}` : ''
    return `${p.title}: ${formatValue(v, p.unit)}${share}${t ? `, ${t.label}` : ''}.`
  }
  if (rows.length === 0) return `${p.title}: nothing to show.`
  const top = rows.reduce((a, b) => (b.value > a.value ? b : a))
  return `${p.title}: ${String(rows.length)} row${rows.length === 1 ? '' : 's'}; the highest is ${top.name} at ${formatValue(top.value, p.unit)}.`
}

export interface LogRow {
  t: number
  pod: string
  text: string
}

/** The newest error lines from a namespace's containers in [start, end]. */
export function errorLogs(
  sim: Simulator,
  namespace: string,
  start: number,
  end: number,
  limit = 20,
): LogRow[] {
  const rows: LogRow[] = []
  for (const c of sim.scenario.clusters) {
    const cluster = sim.clusterByName(c.name)
    for (const pod of cluster?.list('Pod', namespace ? { namespace } : {}) ?? [])
      for (const ct of pod.spec.containers)
        for (const l of logsInWindow(sim, pod, ct.name, start, end))
          if (/"level":"error"|\b(ERROR|FATAL|panic)\b/.test(l.text))
            rows.push({ t: l.t, pod: pod.metadata.name, text: l.text })
  }
  return rows.sort((a, b) => b.t - a.t).slice(0, limit)
}

export const logsSummary = (p: Panel, rows: LogRow[], epochMs: number) =>
  rows.length === 0
    ? `${p.title}: no error lines in this time range.`
    : `${p.title}: ${String(rows.length)} error line${rows.length === 1 ? '' : 's'}; the newest is from ${rows[0]?.pod ?? ''} at ${clockTime(epochMs, rows[0]?.t ?? 0)}.`

/** Sampled requests worth opening from a latency panel: the slowest traces through the chosen services. */
export function slowTraces(sim: Simulator, service: string, start: number, end: number, n = 3) {
  const re = new RegExp(`^(?:${service || '.*'})$`)
  return tracesInWindow(sim, Math.max(start, end - 15 * 60_000), end)
    .filter((t) => t.spans.some((s) => re.test(s.service)))
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, n)
}
