import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { clockTime, formatValue, type Unit } from './format'
import './chart.css'

export interface ChartSeries {
  name: string
  points: [number, number][]
}

/** A horizontal line worth noticing: a threshold or an objective. */
export interface ChartThreshold {
  value: number
  status: 'warn' | 'alert'
  label: string
}

/** A moment worth marking on the time axis: a deploy. */
export interface ChartAnnotation {
  t: number
  text: string
}

const DEFAULT_W = 640
const H = 240
const PAD = { top: 12, right: 112, bottom: 28, left: 64 }
const MAX_SERIES = 8
const DASH = ['', '6 3', '2 3', '10 3 2 3', '', '6 3', '2 3', '10 3 2 3']

/** Round tick values from `lo` up to the first one at or above `hi`. */
function ticks(lo: number, hi: number, n = 4): number[] {
  if (lo === hi) return [lo]
  const raw = (hi - lo) / n
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw
  const out: number[] = []
  for (let v = Math.ceil(lo / step) * step; ; v += step) {
    out.push(v)
    if (v >= hi - step / 1e6) break
  }
  return out
}

const MIN = 60_000
const TIME_STEPS = [MIN, 5 * MIN, 10 * MIN, 15 * MIN, 30 * MIN, 60 * MIN, 120 * MIN, 360 * MIN]
/** Clock-friendly times between t0 and t1 (on the scenario clock): every 5, 10, 15 or 30 minutes, or hours. */
function timeTicks(t0: number, t1: number, epochMs: number): number[] {
  const step = TIME_STEPS.find((s) => (t1 - t0) / s <= 6) ?? 720 * MIN
  const out: number[] = []
  for (let t = Math.ceil((epochMs + t0) / step) * step - epochMs; t <= t1; t += step) out.push(t)
  return out
}

/** "p99 for gate rose from 120 ms to 2.4 s" style: first and last values, and the peak. */
export function summarize(series: ChartSeries[], unit: Unit, epochMs: number): string {
  if (series.length === 0) return 'No data in this time range.'
  const parts = series.slice(0, 3).map((s) => {
    const finite = s.points.filter(([, v]) => Number.isFinite(v))
    const first = finite[0]
    const last = finite.at(-1)
    if (!first || !last) return `${s.name}: no values`
    const peak = finite.reduce((a, b) => (b[1] > a[1] ? b : a))
    const dir =
      last[1] > first[1] * 1.1 ? 'rose' : last[1] < first[1] * 0.9 ? 'fell' : 'held steady'
    return `${s.name} ${dir} from ${formatValue(first[1], unit)} to ${formatValue(last[1], unit)} (peak ${formatValue(peak[1], unit)} at ${clockTime(epochMs, peak[0])})`
  })
  const more = series.length > 3 ? `; ${String(series.length - 3)} more in the table` : ''
  return `${parts.join('; ')}${more}.`
}

/**
 * A time-series line chart (E8). Up to eight series in fixed colour order, each with its own dash pattern,
 * a legend, and direct labels when there are four or fewer, so identity never rests on colour alone.
 * Hovering shows every series' value at that moment. The SVG is a picture for sighted users; its text
 * summary is the accessible description, and views always offer the data as a table too.
 */
export function TimeSeriesChart({
  series,
  unit = 'none',
  epochMs,
  label,
  thresholds = [],
  annotations = [],
  range,
}: {
  series: ChartSeries[]
  unit?: Unit
  epochMs: number
  label: string
  thresholds?: ChartThreshold[]
  annotations?: ChartAnnotation[]
  /** The time axis, when it should span more than the data (a dashboard's range). */
  range?: [number, number]
}) {
  const id = useId()
  const [hover, setHover] = useState<number>()
  // Drawn at its real width, so text stays its real size in narrow panels.
  const box = useRef<HTMLDivElement>(null)
  const [W, setW] = useState(DEFAULT_W)
  useEffect(() => {
    const el = box.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([entry]) => {
      const w = Math.round(entry?.contentRect.width ?? 0)
      if (w > 0) setW(Math.max(280, w))
    })
    ro.observe(el)
    return () => {
      ro.disconnect()
    }
  }, [])
  const shown = series.slice(0, MAX_SERIES)
  const geo = useMemo(() => {
    const all = shown.flatMap((s) => s.points).filter(([, v]) => Number.isFinite(v))
    const t0 = range?.[0] ?? Math.min(...all.map(([t]) => t))
    const t1 = range?.[1] ?? Math.max(...all.map(([t]) => t))
    const vmin = Math.min(0, ...all.map(([, v]) => v))
    // Thresholds stay in view, so "how far from the line" can be seen.
    const vmax0 = Math.max(...all.map(([, v]) => v), ...thresholds.map((th) => th.value * 1.1))
    const yt = ticks(vmin, vmax0 > vmin ? vmax0 : vmin + 1)
    const vmax = yt.at(-1) ?? vmax0
    const x = (t: number) =>
      PAD.left + ((t - t0) / Math.max(1, t1 - t0)) * (W - PAD.left - PAD.right)
    const y = (v: number) =>
      H - PAD.bottom - ((v - vmin) / Math.max(1e-12, vmax - vmin)) * (H - PAD.top - PAD.bottom)
    const xt = timeTicks(t0, t1, epochMs)
    return { all, t0, t1, x, y, yt, xt: xt.length > 1 ? xt : [t0, t1] }
  }, [shown, epochMs, range, thresholds, W])
  const summary = summarize(series, unit, epochMs)
  if (geo.all.length === 0)
    return (
      <p className="viz rounded-md border border-line p-3 text-sm" aria-label={label}>
        No data in this time range.
      </p>
    )
  const times = [...new Set(geo.all.map(([t]) => t))].sort((a, b) => a - b)
  const at = hover === undefined ? undefined : times[hover]
  const direct = shown.length <= 4
  return (
    <figure className="viz grid gap-2" aria-labelledby={`${id}-cap`}>
      <div ref={box} className="relative">
        <svg
          viewBox={`0 0 ${String(W)} ${String(H)}`}
          className="h-auto w-full"
          aria-hidden="true"
          onPointerMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect()
            const px = ((e.clientX - r.left) / r.width) * W
            const t = geo.t0 + ((px - PAD.left) / (W - PAD.left - PAD.right)) * (geo.t1 - geo.t0)
            let best = 0
            times.forEach((tt, i) => {
              if (Math.abs(tt - t) < Math.abs((times[best] ?? 0) - t)) best = i
            })
            setHover(best)
          }}
          onPointerLeave={() => {
            setHover(undefined)
          }}
        >
          {geo.yt.map((v) => (
            <g key={v}>
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={geo.y(v)}
                y2={geo.y(v)}
                className="stroke-line"
                strokeOpacity={0.35}
                strokeWidth={1}
              />
              <text
                x={PAD.left - 6}
                y={geo.y(v) + 4}
                textAnchor="end"
                className="fill-ink-muted text-[11px]"
              >
                {formatValue(v, unit)}
              </text>
            </g>
          ))}
          {geo.xt.map((t) => (
            <text
              key={t}
              x={geo.x(t)}
              y={H - 8}
              textAnchor="middle"
              className="fill-ink-muted text-[11px]"
            >
              {clockTime(epochMs, t)}
            </text>
          ))}
          {thresholds.map((th) => (
            <g key={`th-${String(th.value)}`} data-threshold={th.value}>
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={geo.y(th.value)}
                y2={geo.y(th.value)}
                className={th.status === 'alert' ? 'stroke-alert' : 'stroke-warn'}
                strokeWidth={1.5}
                strokeDasharray="4 4"
              />
              <text
                x={W - PAD.right + 6}
                y={geo.y(th.value) + 4}
                className="fill-ink-muted text-[11px]"
              >
                {th.label}
              </text>
            </g>
          ))}
          {annotations
            .filter((a) => a.t >= geo.t0 && a.t <= geo.t1)
            .map((a) => (
              <g key={`an-${String(a.t)}`} data-annotation={a.t}>
                <line
                  x1={geo.x(a.t)}
                  x2={geo.x(a.t)}
                  y1={PAD.top}
                  y2={H - PAD.bottom}
                  className="stroke-info"
                  strokeWidth={1.5}
                  strokeDasharray="1 3"
                />
                <path
                  d={`M ${String(geo.x(a.t) - 5)} ${String(PAD.top)} h 10 l -5 7 z`}
                  className="fill-info"
                />
              </g>
            ))}
          {shown.map((s, i) => {
            const pts = s.points.filter(([, v]) => Number.isFinite(v))
            const last = pts.at(-1)
            return (
              <g key={s.name}>
                <polyline
                  fill="none"
                  stroke={`var(--series-${String(i + 1)})`}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  strokeDasharray={DASH[i]}
                  points={pts
                    .map(([t, v]) => `${geo.x(t).toFixed(1)},${geo.y(v).toFixed(1)}`)
                    .join(' ')}
                />
                {direct && last && (
                  <text
                    x={geo.x(last[0]) + 6}
                    y={geo.y(last[1]) + 4}
                    className="fill-ink text-[11px]"
                  >
                    {s.name.length > 16 ? `${s.name.slice(0, 15)}…` : s.name}
                  </text>
                )}
              </g>
            )
          })}
          {at !== undefined && (
            <line
              x1={geo.x(at)}
              x2={geo.x(at)}
              y1={PAD.top}
              y2={H - PAD.bottom}
              className="stroke-ink"
              strokeOpacity={0.5}
              strokeWidth={1}
            />
          )}
        </svg>
        {at !== undefined && (
          <div className="pointer-events-none absolute top-2 left-1/2 z-10 -translate-x-1/2 rounded-md border border-line bg-raised p-2 text-xs shadow">
            <p className="font-bold">{clockTime(epochMs, at)}</p>
            {shown.map((s, i) => {
              const v = s.points.find(([t]) => t === at)?.[1]
              return v === undefined ? null : (
                <p key={s.name} className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="inline-block h-0.5 w-4"
                    style={{ background: `var(--series-${String(i + 1)})` }}
                  />
                  {s.name}: {formatValue(v, unit)}
                </p>
              )
            })}
          </div>
        )}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm" aria-label="Legend">
        {shown.map((s, i) => (
          <li key={s.name} className="flex min-w-0 items-center gap-2 [overflow-wrap:anywhere]">
            <svg width="20" height="6" aria-hidden="true">
              <line
                x1="0"
                x2="20"
                y1="3"
                y2="3"
                stroke={`var(--series-${String(i + 1)})`}
                strokeWidth={2}
                strokeDasharray={DASH[i]}
              />
            </svg>
            {s.name}
          </li>
        ))}
        {series.length > MAX_SERIES && (
          <li>{series.length - MAX_SERIES} more series in the table</li>
        )}
      </ul>
      <figcaption id={`${id}-cap`} className="text-sm [overflow-wrap:anywhere]">
        <span className="sr-only">{label}: </span>
        {summary}
        {annotations.some((a) => a.t >= geo.t0 && a.t <= geo.t1) && (
          <>
            {' '}
            Deploys (dotted lines):{' '}
            {annotations
              .filter((a) => a.t >= geo.t0 && a.t <= geo.t1)
              .map((a) => `${a.text} at ${clockTime(epochMs, a.t)}`)
              .join('; ')}
            .
          </>
        )}
      </figcaption>
    </figure>
  )
}
