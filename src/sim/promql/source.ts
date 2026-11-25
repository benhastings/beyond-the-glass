import type { Simulator } from '../core/simulator.ts'
import { STEP_MS } from '../telemetry/model.ts'
import { FAMILIES, rangeSeries } from '../telemetry/metrics.ts'
import type { SeriesSource } from './evaluate.ts'

/** The simulation's telemetry (E8-01) as a PromQL source: series at the scrape interval. */
export function telemetrySource(sim: Simulator): SeriesSource {
  return {
    series: (names, start, end) => {
      const known = names.filter((n) => FAMILIES.some((f) => f.name === n))
      if (names.length > 0 && known.length === 0) return []
      const from = Math.floor(start / STEP_MS) * STEP_MS
      return rangeSeries(sim, from, end, STEP_MS, known)
    },
  }
}
