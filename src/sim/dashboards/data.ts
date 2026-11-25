import type { Simulator } from '../core/simulator.ts'
import { applications } from '../gitops/argo.ts'
import type { RawSeries, SeriesSource } from '../promql/evaluate.ts'
import { FAMILIES, rangeSeries } from '../telemetry/metrics.ts'
import { STEP_MS } from '../telemetry/model.ts'
import type { Dashboard } from './dashboards.ts'

/**
 * Data for a dashboard (E8-02): one fetch of every series for the window, shared by its panels, the
 * variables' values, and deploy annotations from Argo CD's sync history.
 */
const LONGEST_RANGE = 3_600_000 + 5 * 60_000

/** Every metric for [start − 1 h 5 m, end], fetched once and filtered per query. */
export function windowSource(sim: Simulator, start: number, end: number): SeriesSource {
  const from = Math.floor((start - LONGEST_RANGE) / STEP_MS) * STEP_MS
  let all: RawSeries[] | undefined
  return {
    series: (names, s, e) => {
      if (s < from || e > end)
        return rangeSeries(
          sim,
          Math.floor(s / STEP_MS) * STEP_MS,
          e,
          STEP_MS,
          names.filter((n) => FAMILIES.some((f) => f.name === n)),
        )
      all ??= rangeSeries(sim, from, end, STEP_MS)
      return all.filter((x) => names.length === 0 || names.includes(x.labels.__name__ ?? ''))
    },
  }
}

/** A variable's choices: the values its label takes in the window. */
export function variableValues(
  src: SeriesSource,
  metric: string,
  label: string,
  start: number,
  end: number,
): string[] {
  return [
    ...new Set(
      src
        .series([metric], start, end)
        .map((s) => s.labels[label] ?? '')
        .filter(Boolean),
    ),
  ].sort()
}

/** The query with `$name` replaced by each variable's value (a regex; "All" is `.*`). */
export function interpolate(query: string, values: Record<string, string>): string {
  return query.replace(/\$(\w+)/g, (m, name: string) => {
    const v = values[name]
    if (v === undefined) return m
    return v === '' ? '.*' : v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  })
}

export interface Annotation {
  t: number
  app: string
  revision: string
  text: string
}

/** Argo CD deploys in [start, end]: one per entry in each application's sync history. */
export function deployAnnotations(sim: Simulator, start: number, end: number): Annotation[] {
  return applications(sim)
    .flatMap((a) =>
      a.status.history.map((h) => ({
        t: h.deployedAt,
        app: a.name,
        revision: h.revision,
        text: `${a.name} synced to ${h.revision.slice(0, 7)}`,
      })),
    )
    .filter((x) => x.t >= start && x.t <= end)
    .sort((a, b) => a.t - b.t)
}

export const dashboard = (dashboards: readonly Dashboard[], id: string) =>
  dashboards.find((d) => d.id === id)
