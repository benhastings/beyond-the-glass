import { fnv1a32 } from '../core/rng.ts'
import type { Simulator } from '../core/simulator.ts'
import {
  containerHistories,
  stepKey,
  steps,
  valueAt,
  type ContainerHistory,
  type Steps,
} from './history.ts'

/**
 * The service model behind every request signal (E8-01): for each 15-second bucket, each service's request
 * rate, the share that fail, and its median latency, from the scenario's topology and the cluster's
 * history. Requests flow from entry services down their calls; failures and latency flow back up. Metrics,
 * traces and correlated logs all read this, so they agree.
 */
export const STEP_MS = 15_000
export const LATENCY_SIGMA = 0.5

export interface ServiceSpec {
  name: string
  namespace: string
  cluster: string
  deployment: string
  calls: string[]
  latencyMs: number
  rps?: number
  errorRate: number
  kind: 'http' | 'db' | 'queue' | 'worker'
  operation: string
}

export interface ServiceState {
  rps: number
  /** Share of requests that fail (0–1), its own failures plus its calls'. */
  err: number
  /** Share that fail because nothing is ready to serve them (503). */
  unavailable: number
  /** Median latency in ms, including its calls. */
  median: number
}

const DEFAULT_OPERATION = {
  http: 'GET /',
  db: 'SELECT',
  queue: 'publish',
  worker: 'process',
} as const

/** The scenario's services, with defaults filled in. */
export function services(sim: Simulator): ServiceSpec[] {
  const t = sim.scenario.telemetry
  const first = sim.scenario.clusters[0]?.name ?? ''
  return (t?.services ?? []).map((s) => ({
    name: s.name,
    namespace: s.namespace,
    cluster: s.cluster ?? first,
    deployment: s.deployment ?? s.name,
    calls: s.calls,
    latencyMs: s.latencyMs,
    ...(s.rps !== undefined ? { rps: s.rps } : {}),
    errorRate: s.errorRate,
    kind: s.kind,
    operation: s.operation ?? DEFAULT_OPERATION[s.kind],
  }))
}

/** Services nobody calls: where requests arrive from outside. */
export const entryServices = (all: ServiceSpec[]) =>
  all.filter((s) => s.rps !== undefined || !all.some((o) => o.calls.includes(s.name)))

/** A deterministic number in [0, 1) for anything. */
export const unit = (...parts: (string | number)[]) => fnv1a32(parts.join('\u0001')) / 2 ** 32

/** The daily shape: quieter at night, busier in the afternoon (by the scenario clock's time of day). */
function daily(sim: Simulator, t: number): number {
  const amp = sim.scenario.telemetry?.dailyAmplitude ?? 0.3
  const day = 24 * 3600_000
  const tod = (((sim.clock.epochMs + t) % day) + day) % day
  return 1 + amp * Math.sin((2 * Math.PI * (tod - 9 * 3600_000)) / day)
}

/** Containers of a service's Deployment that were running at `t`. */
export function runningAt(ctx: ModelContext, s: ServiceSpec, t: number): ContainerHistory[] {
  return (ctx.inputs.get(s.name)?.histories ?? []).filter((h) =>
    h.runs.some((r) => r.start <= t && (r.end === undefined || r.end > t)),
  )
}

/** What the model reads for one service, looked up once per query rather than once per bucket. */
interface ServiceInputs {
  endpoints: Steps
  errors: Steps
  latency: Steps
  rps: Steps
  histories: ContainerHistory[]
  /** When its containers stopped (not counting deletions), in order: a restart's errors. */
  stops: number[]
}

export interface ModelContext {
  all: ServiceSpec[]
  byName: Map<string, ServiceSpec>
  entries: ServiceSpec[]
  inputs: Map<string, ServiceInputs>
}

/** Everything the model needs, gathered once: the services, their step series and their containers. */
export function modelContext(
  sim: Simulator,
  all = services(sim),
  histories = containerHistories(sim),
): ModelContext {
  const inputs = new Map<string, ServiceInputs>()
  for (const s of all) {
    const mine = histories.filter(
      (h) =>
        h.cluster === s.cluster && h.namespace === s.namespace && h.deployment === s.deployment,
    )
    inputs.set(s.name, {
      endpoints: steps(sim, stepKey('endpoints', s.cluster, s.namespace, s.name)),
      errors: steps(sim, stepKey('errors', s.cluster, s.namespace, s.name)),
      latency: steps(sim, stepKey('latency', s.cluster, s.namespace, s.name)),
      rps: steps(sim, stepKey('rps', s.cluster, s.namespace, s.name)),
      histories: mine,
      stops: mine
        .flatMap((h) =>
          h.runs
            .filter((r) => r.end !== undefined && r.reason !== 'Deleted')
            .map((r) => r.end ?? 0),
        )
        .sort((a, b) => a - b),
    })
  }
  return { all, byName: new Map(all.map((s) => [s.name, s])), entries: entryServices(all), inputs }
}

/** Whether any value in the sorted `xs` falls in [from, to). */
function anyIn(xs: number[], from: number, to: number): boolean {
  let lo = 0
  let hi = xs.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if ((xs[mid] ?? 0) < from) lo = mid + 1
    else hi = mid
  }
  return lo < xs.length && (xs[lo] ?? Infinity) < to
}

/** Every service's state during the bucket starting at `t`. */
export function modelAt(
  sim: Simulator,
  t: number,
  ctx: ModelContext = modelContext(sim),
): Map<string, ServiceState> {
  const { all, byName, entries, inputs } = ctx
  const out = new Map<string, ServiceState>()
  const mid = t + STEP_MS / 2
  const k = Math.floor(t / STEP_MS)
  // Rates: from the entry services down their calls.
  const rps = new Map<string, number>()
  const visit = (s: ServiceSpec, r: number, depth: number) => {
    rps.set(s.name, (rps.get(s.name) ?? 0) + r)
    if (depth > 20) return
    for (const c of s.calls) {
      const callee = byName.get(c)
      if (callee) visit(callee, r, depth + 1)
    }
  }
  const shape = daily(sim, mid)
  for (const e of entries) {
    const override = valueAt(inputs.get(e.name)?.rps ?? [], mid, -1)
    const base = override >= 0 ? override : (e.rps ?? 0)
    visit(e, base * shape * (1 + 0.16 * (unit(sim.scenario.seed, 'rps', e.name, k) - 0.5)), 0)
  }
  // Failures and latency: from the callees back up.
  const resolve = (s: ServiceSpec, depth: number): ServiceState => {
    const done = out.get(s.name)
    if (done) return done
    const inp = inputs.get(s.name)
    const endpoints = valueAt(inp?.endpoints ?? [], mid, 1)
    const injected = valueAt(inp?.errors ?? [], mid, 0)
    const extra = valueAt(inp?.latency ?? [], mid, 0)
    // No ready endpoints: every request fails at once with a 503.
    const unavailable = endpoints === 0 ? 1 : 0
    let err = Math.min(
      1,
      s.errorRate + injected + (anyIn(inp?.stops ?? [], t, t + STEP_MS) ? 0.05 : 0),
    )
    let median = s.latencyMs + extra
    if (depth < 20)
      for (const c of s.calls) {
        const callee = byName.get(c)
        if (!callee) continue
        const cs = resolve(callee, depth + 1)
        err = 1 - (1 - err) * (1 - cs.err)
        median += cs.median
      }
    const state: ServiceState = {
      rps: rps.get(s.name) ?? 0,
      err: unavailable ? 1 : err,
      unavailable,
      // Nothing to serve it: it fails fast.
      median: unavailable ? 1 : median,
    }
    out.set(s.name, state)
    return state
  }
  for (const s of all) resolve(s, 0)
  return out
}

/** The normal distribution's CDF (Abramowitz–Stegun 7.1.26 via erf). */
export function normalCdf(x: number): number {
  const z = Math.abs(x) / Math.SQRT2
  const tt = 1 / (1 + 0.3275911 * z)
  const erf =
    1 -
    ((((1.061405429 * tt - 1.453152027) * tt + 1.421413741) * tt - 0.284496735) * tt +
      0.254829592) *
      tt *
      Math.exp(-z * z)
  return x >= 0 ? (1 + erf) / 2 : (1 - erf) / 2
}

/** Its inverse (Acklam's rational approximation), for sampling latencies. */
export function normalQuantile(p: number): number {
  const q = Math.min(Math.max(p, 1e-9), 1 - 1e-9)
  const a = [
    -39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716,
    2.506628277459239,
  ]
  const b = [
    -54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972,
    -13.28068155288572,
  ]
  const c = [
    -0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734,
    4.374664141464968, 2.938163982698783,
  ]
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416]
  const [a0, a1, a2, a3, a4, a5] = a as [number, number, number, number, number, number]
  const [b0, b1, b2, b3, b4] = b as [number, number, number, number, number]
  const [c0, c1, c2, c3, c4, c5] = c as [number, number, number, number, number, number]
  const [d0, d1, d2, d3] = d as [number, number, number, number]
  if (q < 0.02425) {
    const r = Math.sqrt(-2 * Math.log(q))
    return (
      (((((c0 * r + c1) * r + c2) * r + c3) * r + c4) * r + c5) /
      ((((d0 * r + d1) * r + d2) * r + d3) * r + 1)
    )
  }
  if (q > 1 - 0.02425) {
    const r = Math.sqrt(-2 * Math.log(1 - q))
    return (
      -(((((c0 * r + c1) * r + c2) * r + c3) * r + c4) * r + c5) /
      ((((d0 * r + d1) * r + d2) * r + d3) * r + 1)
    )
  }
  const r = q - 0.5
  const r2 = r * r
  return (
    ((((((a0 * r2 + a1) * r2 + a2) * r2 + a3) * r2 + a4) * r2 + a5) * r) /
    (((((b0 * r2 + b1) * r2 + b2) * r2 + b3) * r2 + b4) * r2 + 1)
  )
}

/** Share of requests faster than `leMs` when latencies are log-normal around `median`. */
export const fasterThan = (leMs: number, median: number) =>
  leMs === Infinity ? 1 : normalCdf((Math.log(leMs) - Math.log(median)) / LATENCY_SIGMA)

/** `fasterThan` for many boundaries at once (their logs given), sharing the median's log. */
export function fasterThanAll(logLeMs: readonly number[], median: number): number[] {
  const m = Math.log(median)
  return logLeMs.map((l) => (l === Infinity ? 1 : normalCdf((l - m) / LATENCY_SIGMA)))
}

/** A latency (ms) for a hashed uniform `u`. */
export const sampleLatency = (median: number, u: number) =>
  median * Math.exp(LATENCY_SIGMA * normalQuantile(u))
