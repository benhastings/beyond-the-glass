import { PromqlError } from './lexer.ts'
import { isComparison, parse, type Expr, type Matcher } from './parser.ts'

/**
 * The PromQL evaluator (E8-03): instant and range queries over any source of series, with Prometheus'
 * semantics for the subset it supports. The 5-minute lookback for instant selectors, `rate` and `increase`
 * extrapolation (counter resets included), `histogram_quantile`'s bucket interpolation, and one-to-one
 * vector matching.
 */
export type Labels = Record<string, string>
export interface RawSeries {
  labels: Labels
  points: [number, number][]
}

/** Where series come from: the simulation's telemetry, or fixtures in tests. */
export interface SeriesSource {
  /** Every series of these metrics (all metrics if `names` is empty) with samples in [start, end]. */
  series: (names: readonly string[], start: number, end: number) => RawSeries[]
}

export type Value =
  | { kind: 'scalar'; value: number }
  | { kind: 'string'; value: string }
  | { kind: 'vector'; samples: { labels: Labels; value: number }[] }
  | { kind: 'matrix'; series: RawSeries[] }

export const LOOKBACK_MS = 5 * 60_000

const signature = (l: Labels, drop: readonly string[] = ['__name__'], keep?: readonly string[]) =>
  JSON.stringify(
    Object.entries(l)
      .filter(([k]) => (keep ? keep.includes(k) : !drop.includes(k)))
      .sort(([a], [b]) => (a < b ? -1 : 1)),
  )
const withoutName = (l: Labels): Labels =>
  Object.fromEntries(Object.entries(l).filter(([k]) => k !== '__name__'))

function matches(l: Labels, name: string | undefined, ms: readonly Matcher[]): boolean {
  if (name !== undefined && l.__name__ !== name) return false
  return ms.every((m) => {
    const v = l[m.label] ?? ''
    switch (m.op) {
      case '=':
        return v === m.value
      case '!=':
        return v !== m.value
      case '=~':
        return new RegExp(`^(?:${m.value})$`).test(v)
      default:
        return !new RegExp(`^(?:${m.value})$`).test(v)
    }
  })
}

/** The furthest back any selector looks, beyond the query's own start. */
function reach(e: Expr): number {
  switch (e.type) {
    case 'selector':
      return Math.max(0, e.offset) + (e.range ?? LOOKBACK_MS)
    case 'call':
      return Math.max(0, ...e.args.map(reach))
    case 'agg':
      return Math.max(reach(e.expr), e.param ? reach(e.param) : 0)
    case 'binary':
      return Math.max(reach(e.lhs), reach(e.rhs))
    case 'unary':
      return reach(e.expr)
    default:
      return 0
  }
}

/** Metric names the query reads ([] when a selector has no name: everything). */
function names(e: Expr): string[] | undefined {
  switch (e.type) {
    case 'selector':
      return e.name ? [e.name] : undefined
    case 'call':
    case 'agg':
    case 'binary':
    case 'unary': {
      const parts =
        e.type === 'call'
          ? e.args
          : e.type === 'agg'
            ? [e.expr, ...(e.param ? [e.param] : [])]
            : e.type === 'binary'
              ? [e.lhs, e.rhs]
              : [e.expr]
      const all = parts.map(names)
      return all.some((x) => x === undefined) ? undefined : [...new Set(all.flat() as string[])]
    }
    default:
      return []
  }
}

/** Prometheus' extrapolated rate/increase over the samples in (rangeStart, rangeEnd]. */
export function extrapolatedRate(
  points: [number, number][],
  rangeStart: number,
  rangeEnd: number,
  isRate: boolean,
): number | undefined {
  if (points.length < 2) return undefined
  const first = points[0] as [number, number]
  const last = points.at(-1) as [number, number]
  let result = last[1] - first[1]
  for (let j = 1; j < points.length; j++) {
    const prev = (points[j - 1] as [number, number])[1]
    if ((points[j] as [number, number])[1] < prev) result += prev
  }
  const sampled = (last[0] - first[0]) / 1000
  if (sampled <= 0) return undefined
  let toStart = (first[0] - rangeStart) / 1000
  const toEnd = (rangeEnd - last[0]) / 1000
  const avgGap = sampled / (points.length - 1)
  if (result > 0 && first[1] >= 0) {
    const toZero = sampled * (first[1] / result)
    if (toZero < toStart) toStart = toZero
  }
  const threshold = avgGap * 1.1
  let interval = sampled
  interval += toStart < threshold ? toStart : avgGap / 2
  interval += toEnd < threshold ? toEnd : avgGap / 2
  result *= interval / sampled
  return isRate ? result / ((rangeEnd - rangeStart) / 1000) : result
}

/** Prometheus' bucketQuantile: linear interpolation inside the bucket that holds the rank. */
export function bucketQuantile(q: number, buckets: { le: number; count: number }[]): number {
  if (Number.isNaN(q)) return NaN
  if (q < 0) return -Infinity
  if (q > 1) return Infinity
  const b = [...buckets].sort((x, y) => x.le - y.le)
  if (b.length < 2 || b.at(-1)?.le !== Infinity) return NaN
  // Bucket counts must not go down; fix small inconsistencies as Prometheus does.
  for (let j = 1; j < b.length; j++) {
    const cur = b[j] as { le: number; count: number }
    const prev = b[j - 1] as { le: number; count: number }
    if (cur.count < prev.count) cur.count = prev.count
  }
  const total = b.at(-1)?.count ?? 0
  if (total === 0) return NaN
  let rank = q * total
  const idx = b.findIndex((x) => x.count >= rank)
  if (idx === b.length - 1) return b[b.length - 2]?.le ?? NaN
  if (idx === 0 && (b[0]?.le ?? 0) <= 0) return b[0]?.le ?? NaN
  const end = b[idx] as { le: number; count: number }
  let start = 0
  let count = end.count
  if (idx > 0) {
    const prev = b[idx - 1] as { le: number; count: number }
    start = prev.le
    count -= prev.count
    rank -= prev.count
  }
  return start + (end.le - start) * (rank / count)
}

const ARITH: Record<string, (a: number, b: number) => number> = {
  '+': (a, b) => a + b,
  '-': (a, b) => a - b,
  '*': (a, b) => a * b,
  '/': (a, b) => a / b,
  '%': (a, b) => a % b,
  '^': (a, b) => a ** b,
  '==': (a, b) => (a === b ? 1 : 0),
  '!=': (a, b) => (a !== b ? 1 : 0),
  '<': (a, b) => (a < b ? 1 : 0),
  '>': (a, b) => (a > b ? 1 : 0),
  '<=': (a, b) => (a <= b ? 1 : 0),
  '>=': (a, b) => (a >= b ? 1 : 0),
}

class Evaluator {
  private readonly data: RawSeries[]
  constructor(data: RawSeries[]) {
    this.data = data
  }

  at(e: Expr, t: number): Value {
    switch (e.type) {
      case 'number':
        return { kind: 'scalar', value: e.value }
      case 'string':
        return { kind: 'string', value: e.value }
      case 'unary': {
        const v = this.at(e.expr, t)
        if (e.op === '+') return v
        if (v.kind === 'scalar') return { kind: 'scalar', value: -v.value }
        if (v.kind === 'vector')
          return {
            kind: 'vector',
            samples: v.samples.map((s) => ({ labels: withoutName(s.labels), value: -s.value })),
          }
        throw new PromqlError('unary minus needs a number or an instant vector')
      }
      case 'selector': {
        const end = t - e.offset
        const sel = this.data.filter((s) => matches(s.labels, e.name, e.matchers))
        if (e.range !== undefined) {
          const start = end - e.range
          return {
            kind: 'matrix',
            series: sel
              .map((s) => ({
                labels: s.labels,
                points: s.points.filter(([pt]) => pt > start && pt <= end),
              }))
              .filter((s) => s.points.length > 0),
          }
        }
        return {
          kind: 'vector',
          samples: sel.flatMap((s) => {
            let last: [number, number] | undefined
            for (const p of s.points) if (p[0] <= end && p[0] > end - LOOKBACK_MS) last = p
            return last ? [{ labels: s.labels, value: last[1] }] : []
          }),
        }
      }
      case 'call':
        return this.call(e.fn, e.args, t)
      case 'agg':
        return this.aggregate(e, t)
      case 'binary':
        return this.binary(e, t)
    }
  }

  private call(fn: string, args: Expr[], t: number): Value {
    if (fn === 'histogram_quantile') {
      const q = this.at(args[0] as Expr, t)
      const v = this.at(args[1] as Expr, t)
      if (q.kind !== 'scalar')
        throw new PromqlError('histogram_quantile() needs a number first, like 0.99')
      if (v.kind !== 'vector')
        throw new PromqlError(
          'histogram_quantile() needs an instant vector of buckets: wrap a range in rate()',
        )
      const groups = new Map<string, { labels: Labels; buckets: { le: number; count: number }[] }>()
      for (const s of v.samples) {
        const le = s.labels.le
        if (le === undefined) continue
        const key = signature(s.labels, ['__name__', 'le'])
        const g = groups.get(key) ?? {
          labels: Object.fromEntries(
            Object.entries(s.labels).filter(([k]) => k !== '__name__' && k !== 'le'),
          ),
          buckets: [],
        }
        g.buckets.push({ le: le === '+Inf' ? Infinity : Number(le), count: s.value })
        groups.set(key, g)
      }
      return {
        kind: 'vector',
        samples: [...groups.values()].map((g) => ({
          labels: g.labels,
          value: bucketQuantile(q.value, g.buckets),
        })),
      }
    }
    const arg = args[0] as Expr
    const m = this.at(arg, t)
    if (m.kind !== 'matrix')
      throw new PromqlError(
        `${fn}() needs a range vector, like ${fn}(http_server_requests_total[5m])`,
      )
    const range = arg.type === 'selector' ? (arg.range ?? 0) : 0
    const offset = arg.type === 'selector' ? arg.offset : 0
    const end = t - offset
    return {
      kind: 'vector',
      samples: m.series.flatMap((s) => {
        let v: number | undefined
        if (fn === 'irate') {
          const a = s.points.at(-2)
          const b = s.points.at(-1)
          if (a && b && b[0] > a[0]) v = (b[1] < a[1] ? b[1] : b[1] - a[1]) / ((b[0] - a[0]) / 1000)
        } else v = extrapolatedRate(s.points, end - range, end, fn === 'rate')
        return v === undefined ? [] : [{ labels: withoutName(s.labels), value: v }]
      }),
    }
  }

  private aggregate(e: Extract<Expr, { type: 'agg' }>, t: number): Value {
    const v = this.at(e.expr, t)
    if (v.kind !== 'vector')
      throw new PromqlError(`${e.op}() needs an instant vector: wrap a range in rate() first`)
    const g = e.grouping
    const key = (l: Labels) =>
      g?.mode === 'by'
        ? signature(l, [], g.labels)
        : signature(l, ['__name__', ...(g?.labels ?? [])])
    const labelsFor = (l: Labels): Labels =>
      g?.mode === 'by'
        ? Object.fromEntries(Object.entries(l).filter(([k]) => g.labels.includes(k)))
        : Object.fromEntries(
            Object.entries(l).filter(
              ([k]) => k !== '__name__' && !(g?.labels ?? []).includes(k) && g !== undefined,
            ),
          )
    const groups = new Map<
      string,
      { labels: Labels; samples: { labels: Labels; value: number }[] }
    >()
    for (const s of v.samples) {
      const k = g ? key(s.labels) : '{}'
      const grp = groups.get(k) ?? { labels: g ? labelsFor(s.labels) : {}, samples: [] }
      grp.samples.push(s)
      groups.set(k, grp)
    }
    if (e.op === 'topk') {
      const p = e.param ? this.at(e.param, t) : undefined
      if (p?.kind !== 'scalar')
        throw new PromqlError('topk() needs a number first, like topk(3, …)')
      const k = Math.floor(p.value)
      return {
        kind: 'vector',
        samples: [...groups.values()].flatMap((grp) =>
          [...grp.samples].sort((a, b) => b.value - a.value).slice(0, Math.max(0, k)),
        ),
      }
    }
    return {
      kind: 'vector',
      samples: [...groups.values()].map((grp) => {
        const xs = grp.samples.map((s) => s.value)
        const sum = xs.reduce((a, b) => a + b, 0)
        const value =
          e.op === 'sum'
            ? sum
            : e.op === 'avg'
              ? sum / xs.length
              : e.op === 'max'
                ? Math.max(...xs)
                : e.op === 'min'
                  ? Math.min(...xs)
                  : xs.length
        return { labels: grp.labels, value }
      }),
    }
  }

  private binary(e: Extract<Expr, { type: 'binary' }>, t: number): Value {
    const l = this.at(e.lhs, t)
    const r = this.at(e.rhs, t)
    const cmp = isComparison(e.op)
    if (['and', 'or', 'unless'].includes(e.op)) {
      if (l.kind !== 'vector' || r.kind !== 'vector')
        throw new PromqlError(`"${e.op}" works on two instant vectors`)
      const sig = (x: Labels) =>
        e.matching?.mode === 'on'
          ? signature(x, [], e.matching.labels)
          : signature(x, ['__name__', ...(e.matching?.labels ?? [])])
      const right = new Set(r.samples.map((s) => sig(s.labels)))
      if (e.op === 'and')
        return { kind: 'vector', samples: l.samples.filter((s) => right.has(sig(s.labels))) }
      if (e.op === 'unless')
        return { kind: 'vector', samples: l.samples.filter((s) => !right.has(sig(s.labels))) }
      const left = new Set(l.samples.map((s) => sig(s.labels)))
      return {
        kind: 'vector',
        samples: [...l.samples, ...r.samples.filter((s) => !left.has(sig(s.labels)))],
      }
    }
    const f = ARITH[e.op]
    if (!f) throw new PromqlError(`"${e.op}" isn't an operator here`)
    if (l.kind === 'scalar' && r.kind === 'scalar') {
      if (cmp && !e.bool)
        throw new PromqlError('comparing two numbers needs "bool", like 1 > bool 0')
      return { kind: 'scalar', value: f(l.value, r.value) }
    }
    const scalarSide = (
      vec: Extract<Value, { kind: 'vector' }>,
      n: number,
      vecLeft: boolean,
    ): Value => ({
      kind: 'vector',
      samples: vec.samples.flatMap((s) => {
        const res = vecLeft ? f(s.value, n) : f(n, s.value)
        if (cmp && !e.bool) return res ? [{ labels: s.labels, value: s.value }] : []
        return [{ labels: withoutName(s.labels), value: res }]
      }),
    })
    if (l.kind === 'vector' && r.kind === 'scalar') return scalarSide(l, r.value, true)
    if (l.kind === 'scalar' && r.kind === 'vector') return scalarSide(r, l.value, false)
    if (l.kind === 'vector' && r.kind === 'vector') {
      const sig = (x: Labels) =>
        e.matching?.mode === 'on'
          ? signature(x, [], e.matching.labels)
          : signature(x, ['__name__', ...(e.matching?.labels ?? [])])
      const right = new Map<string, number>()
      for (const s of r.samples) {
        const k = sig(s.labels)
        if (right.has(k))
          throw new PromqlError(
            `many-to-one matching: more than one series on the right matches ${k}. Narrow it with on (…), or aggregate first`,
          )
        right.set(k, s.value)
      }
      return {
        kind: 'vector',
        samples: l.samples.flatMap((s) => {
          const rv = right.get(sig(s.labels))
          if (rv === undefined) return []
          const res = f(s.value, rv)
          if (cmp && !e.bool) return res ? [{ labels: s.labels, value: s.value }] : []
          const labels =
            e.matching?.mode === 'on'
              ? Object.fromEntries(
                  Object.entries(s.labels).filter(([k]) => e.matching?.labels.includes(k)),
                )
              : withoutName(s.labels)
          if (e.matching?.mode === 'ignoring')
            for (const k of e.matching.labels) Reflect.deleteProperty(labels, k)
          return [{ labels, value: res }]
        }),
      }
    }
    throw new PromqlError(
      `"${e.op}" needs numbers or instant vectors on both sides: wrap a range in rate() first`,
    )
  }
}

export interface RangeResult {
  resultType: 'matrix' | 'scalar'
  series: RawSeries[]
}

function fetch(src: SeriesSource, e: Expr, start: number, end: number): RawSeries[] {
  return src.series(names(e) ?? [], start - reach(e), end)
}

/** Evaluates `query` at one moment (`t`, sim ms). */
export function instantQuery(src: SeriesSource, query: string, t: number): Value {
  const e = parse(query)
  return new Evaluator(fetch(src, e, t, t)).at(e, t)
}

/** Evaluates `query` at every step from `start` to `end`: one series per label set. */
export function rangeQuery(
  src: SeriesSource,
  query: string,
  start: number,
  end: number,
  step: number,
): RangeResult {
  const e = parse(query)
  const ev = new Evaluator(fetch(src, e, start, end))
  const out = new Map<string, RawSeries>()
  let scalar = false
  for (let t = start; t <= end; t += step) {
    const v = ev.at(e, t)
    if (v.kind === 'matrix')
      throw new PromqlError('a range vector can’t be graphed: wrap it in rate() or increase()')
    if (v.kind === 'string') throw new PromqlError('a string can’t be graphed')
    if (v.kind === 'scalar') {
      scalar = true
      const s = out.get('scalar') ?? { labels: {}, points: [] }
      s.points.push([t, v.value])
      out.set('scalar', s)
      continue
    }
    for (const smp of v.samples) {
      const k = signature(smp.labels, [])
      const s = out.get(k) ?? { labels: smp.labels, points: [] }
      s.points.push([t, smp.value])
      out.set(k, s)
    }
  }
  return { resultType: scalar ? 'scalar' : 'matrix', series: [...out.values()] }
}
