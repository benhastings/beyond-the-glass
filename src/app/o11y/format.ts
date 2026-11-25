/** Number and time formats for observability views (E8). */
const UNITS = ['', 'K', 'M', 'G', 'T']
const BYTES = ['B', 'KiB', 'MiB', 'GiB', 'TiB']

export type Unit = 'none' | 'bytes' | 'seconds' | 'percent' | 'rps'

export function formatValue(v: number, unit: Unit = 'none'): string {
  if (!Number.isFinite(v)) return Number.isNaN(v) ? 'NaN' : v > 0 ? '+Inf' : '-Inf'
  const round = (x: number) =>
    (Math.abs(x) >= 100 ? x.toFixed(0) : Math.abs(x) >= 10 ? x.toFixed(1) : x.toFixed(2)).replace(
      /\.0+$|(\.\d*?)0+$/,
      '$1',
    )
  switch (unit) {
    case 'bytes': {
      let i = 0
      let x = v
      while (Math.abs(x) >= 1024 && i < BYTES.length - 1) {
        x /= 1024
        i++
      }
      return `${round(x)} ${BYTES[i] ?? 'B'}`
    }
    case 'seconds':
      return Math.abs(v) < 1 ? `${round(v * 1000)} ms` : `${round(v)} s`
    case 'percent':
      return `${round(v * 100)}%`
    case 'rps':
      return `${round(v)} req/s`
    default: {
      let i = 0
      let x = v
      while (Math.abs(x) >= 1000 && i < UNITS.length - 1) {
        x /= 1000
        i++
      }
      return `${round(x)}${UNITS[i] ?? ''}`
    }
  }
}

/** A sim time as the wall clock shows it: `21:14` (UTC, the scenario's clock). */
export const clockTime = (epochMs: number, t: number) =>
  new Date(epochMs + t).toISOString().slice(11, 16)

/** Guesses the unit from a query: bytes, seconds, a ratio, or a rate. */
export function unitFor(query: string): Unit {
  if (/bytes/.test(query) && !/\/\s*(ignoring|on)?/.test(query)) return 'bytes'
  if (/histogram_quantile|duration_seconds_sum[\s\S]*\//.test(query)) return 'seconds'
  if (/\/[\s\S]*(rate|limits)/.test(query)) return 'percent'
  if (/\b(i?rate)\(/.test(query)) return 'rps'
  return 'none'
}
