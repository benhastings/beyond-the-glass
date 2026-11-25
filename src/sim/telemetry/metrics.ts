import { imageBehaviour } from '../core/behaviour.ts'
import { fnv1a32 } from '../core/rng.ts'
import type { Simulator } from '../core/simulator.ts'
import {
  containerHistories,
  stepKey,
  stepSeries,
  steps,
  valueAt,
  type ContainerHistory,
} from './history.ts'
import { fasterThanAll, LATENCY_SIGMA, modelAt, modelContext, services, STEP_MS } from './model.ts'

/**
 * Metrics (E8-01), in Prometheus' naming: per-service RED metrics after OpenTelemetry's HTTP conventions, and
 * kube-state-metrics / cAdvisor-style series per pod and Deployment. Computed for the window asked for, from
 * the service model and the cluster's history; nothing is stored. Counters count from a fixed origin six
 * hours before the scenario starts, so every window agrees about them.
 */
export interface MetricFamily {
  name: string
  type: 'counter' | 'gauge' | 'histogram'
  help: string
  labels: string[]
}

/** One series: its labels (`__name__` included) and `[time ms, value]` samples. */
export interface Series {
  labels: Record<string, string>
  points: [number, number][]
}

export const ORIGIN = -6 * 3600_000
/** OpenTelemetry's recommended boundaries for `http.server.request.duration`, in seconds. */
export const LE = [
  0.005,
  0.01,
  0.025,
  0.05,
  0.075,
  0.1,
  0.25,
  0.5,
  0.75,
  1,
  2.5,
  5,
  7.5,
  10,
  Infinity,
]

const REQUEST_LABELS = ['cluster', 'namespace', 'service']
const POD_LABELS = ['cluster', 'namespace', 'pod', 'container']
export const FAMILIES: MetricFamily[] = [
  {
    name: 'http_server_requests_total',
    type: 'counter',
    help: 'HTTP requests served, by response status code.',
    labels: [...REQUEST_LABELS, 'http_response_status_code'],
  },
  {
    name: 'http_server_request_duration_seconds_bucket',
    type: 'histogram',
    help: 'How long requests took: a cumulative histogram bucket (le, in seconds).',
    labels: [...REQUEST_LABELS, 'le'],
  },
  {
    name: 'http_server_request_duration_seconds_sum',
    type: 'counter',
    help: 'Total time spent serving requests, in seconds.',
    labels: REQUEST_LABELS,
  },
  {
    name: 'http_server_request_duration_seconds_count',
    type: 'counter',
    help: 'Requests the duration histogram has counted.',
    labels: REQUEST_LABELS,
  },
  {
    name: 'kube_pod_container_status_restarts_total',
    type: 'counter',
    help: 'Times the container has restarted.',
    labels: POD_LABELS,
  },
  {
    name: 'container_memory_working_set_bytes',
    type: 'gauge',
    help: 'Memory the container is using, in bytes (the peak in each scrape interval).',
    labels: POD_LABELS,
  },
  {
    name: 'kube_pod_container_resource_limits',
    type: 'gauge',
    help: 'The container’s resource limit (memory, in bytes).',
    labels: [...POD_LABELS, 'resource', 'unit'],
  },
  {
    name: 'kube_deployment_status_replicas_available',
    type: 'gauge',
    help: 'Replicas available to serve.',
    labels: ['cluster', 'namespace', 'deployment'],
  },
]

const LOG_LE_MS = LE.map((le) => Math.log(le * 1000))
const formatLe = (le: number) => (le === Infinity ? '+Inf' : String(le))
/** The times to sample: `start`, `start + step`, …, up to `end`. */
const times = (start: number, end: number, step: number) => {
  const out: number[] = []
  for (let t = start; t <= end; t += step) out.push(t)
  return out
}

type Acc = { ok: number; s500: number; s503: number; sum: number; buckets: number[] }
const zero = (): Acc => ({ ok: 0, s500: 0, s503: 0, sum: 0, buckets: LE.map(() => 0) })
const copy = (a: Acc): Acc => ({ ...a, buckets: [...a.buckets] })

/**
 * Hourly counter checkpoints, per simulation. History only ever changes at or after `now`, so the counters
 * up to a boundary at least one bucket before `now` never change again: later queries start there instead
 * of at the origin. At most one small entry per hour.
 */
const CHECKPOINT_MS = 3600_000
const checkpoints = new WeakMap<Simulator, Map<number, Map<string, Acc>>>()

/** Request counters for every service, sampled at `ts`. */
function requestSeries(sim: Simulator, ts: number[], want: (name: string) => boolean): Series[] {
  const all = services(sim)
  if (all.length === 0 || ts.length === 0) return []
  const ctx = modelContext(sim, all)
  const first = Math.min(ORIGIN, ts[0] ?? 0)
  const last = ts.at(-1) ?? 0
  const saved = checkpoints.get(sim) ?? new Map<number, Map<string, Acc>>()
  checkpoints.set(sim, saved)
  const from = Math.max(...[...saved.keys()].filter((k) => k <= (ts[0] ?? 0)), -Infinity)
  const acc = new Map<string, Acc>(
    all.map((s) => [s.name, copy(saved.get(from)?.get(s.name) ?? zero())]),
  )
  const samples = new Map(all.map((s) => [s.name, [] as { t: number; a: Acc }[]]))
  let i = 0
  const startAt = Number.isFinite(from) ? from : Math.floor(first / STEP_MS) * STEP_MS
  for (let b = startAt; b <= last && i < ts.length; b += STEP_MS) {
    if ((b - ORIGIN) % CHECKPOINT_MS === 0 && b <= sim.now - STEP_MS && !saved.has(b))
      saved.set(b, new Map([...acc].map(([k, v]) => [k, copy(v)])))
    const model = modelAt(sim, b, ctx)
    // Samples inside this bucket see the counters so far, plus its share of this bucket.
    const inc = new Map<string, Acc>()
    for (const s of all) {
      const m = model.get(s.name)
      if (!m) continue
      const n = m.rps * (STEP_MS / 1000)
      const failed = n * m.err
      inc.set(s.name, {
        ok: n - failed,
        s503: n * m.unavailable,
        s500: failed - n * m.unavailable,
        sum: (n * m.median * Math.exp((LATENCY_SIGMA * LATENCY_SIGMA) / 2)) / 1000,
        buckets: fasterThanAll(LOG_LE_MS, m.median).map((f) => n * f),
      })
    }
    while (i < ts.length && (ts[i] ?? 0) < b + STEP_MS) {
      const t = ts[i] ?? 0
      const frac = Math.max(0, (t - b) / STEP_MS)
      for (const s of all) {
        const a = acc.get(s.name)
        const d = inc.get(s.name)
        if (!a || !d) continue
        samples.get(s.name)?.push({
          t,
          a: {
            ok: a.ok + d.ok * frac,
            s500: a.s500 + d.s500 * frac,
            s503: a.s503 + d.s503 * frac,
            sum: a.sum + d.sum * frac,
            buckets: a.buckets.map((v, j) => v + (d.buckets[j] ?? 0) * frac),
          },
        })
      }
      i++
    }
    for (const s of all) {
      const a = acc.get(s.name)
      const d = inc.get(s.name)
      if (!a || !d) continue
      a.ok += d.ok
      a.s500 += d.s500
      a.s503 += d.s503
      a.sum += d.sum
      a.buckets = a.buckets.map((v, j) => v + (d.buckets[j] ?? 0))
    }
  }
  const out: Series[] = []
  for (const s of all) {
    const base = { cluster: s.cluster, namespace: s.namespace, service: s.name }
    const pts = samples.get(s.name) ?? []
    const series = (name: string, extra: Record<string, string>, f: (a: Acc) => number) => {
      if (want(name))
        out.push({
          labels: { __name__: name, ...base, ...extra },
          points: pts.map(({ t, a }) => [t, f(a)]),
        })
    }
    series('http_server_requests_total', { http_response_status_code: '200' }, (a) => a.ok)
    series('http_server_requests_total', { http_response_status_code: '500' }, (a) => a.s500)
    series('http_server_requests_total', { http_response_status_code: '503' }, (a) => a.s503)
    LE.forEach((le, j) => {
      series(
        'http_server_request_duration_seconds_bucket',
        { le: formatLe(le) },
        (a) => a.buckets[j] ?? 0,
      )
    })
    series('http_server_request_duration_seconds_sum', {}, (a) => a.sum)
    series('http_server_request_duration_seconds_count', {}, (a) => a.buckets.at(-1) ?? 0)
  }
  return out
}

const MI = 1024 ** 2
/** A container's steady memory use (its image's behaviour, or a small stable amount). */
export const baselineMemory = (sim: Simulator, h: ContainerHistory) =>
  Math.round(
    (imageBehaviour(sim, h.image).memoryMi ?? 16 + (fnv1a32(h.image || h.container) % 64)) * MI,
  )

/** The container's peak memory in (from, to], or undefined if it wasn't running. */
export function peakMemory(
  sim: Simulator,
  h: ContainerHistory,
  from: number,
  to: number,
): number | undefined {
  // The working set can't pass the limit: the kernel kills the process there.
  const steady = h.limit > 0 ? Math.min(baselineMemory(sim, h), h.limit) : baselineMemory(sim, h)
  let peak: number | undefined
  for (const r of h.runs) {
    const end = r.end ?? Infinity
    if (r.start > to || end <= from) continue
    let v = steady
    // A run killed for memory climbs from a little over half the limit to the limit, where it dies.
    if (r.reason === 'OOMKilled' && h.limit > 0 && r.end !== undefined) {
      const low = h.limit * 0.6
      const until = Math.min(to, r.end)
      v =
        r.end <= to
          ? h.limit
          : low + (h.limit - low) * Math.min(1, (until - r.start) / Math.max(1, r.end - r.start))
    }
    peak = Math.max(peak ?? 0, v)
  }
  return peak
}

/** Whether the pod existed at `t` (from its first run until it was deleted). */
const exists = (h: ContainerHistory, t: number) => {
  const first = h.runs[0]
  const last = h.runs.at(-1)
  return (
    first !== undefined &&
    first.start <= t &&
    !(last?.reason === 'Deleted' && last.end !== undefined && t > last.end)
  )
}

function podSeries(
  sim: Simulator,
  ts: number[],
  step: number,
  want: (name: string) => boolean,
): Series[] {
  const out: Series[] = []
  for (const h of containerHistories(sim)) {
    const base = { cluster: h.cluster, namespace: h.namespace, pod: h.pod, container: h.container }
    const alive = ts.filter((t) => exists(h, t))
    if (want('kube_pod_container_status_restarts_total') && alive.length) {
      const st = steps(sim, stepKey('restarts', h.cluster, h.namespace, `${h.pod}/${h.container}`))
      out.push({
        labels: { __name__: 'kube_pod_container_status_restarts_total', ...base },
        points: alive.map((t) => [t, valueAt(st, t)]),
      })
    }
    if (want('kube_pod_container_resource_limits') && alive.length && h.limit > 0)
      out.push({
        labels: {
          __name__: 'kube_pod_container_resource_limits',
          ...base,
          resource: 'memory',
          unit: 'byte',
        },
        points: alive.map((t) => [t, h.limit]),
      })
    if (want('container_memory_working_set_bytes')) {
      const points = ts.flatMap((t): [number, number][] => {
        const v = peakMemory(sim, h, t - step, t)
        return v === undefined ? [] : [[t, v]]
      })
      if (points.length)
        out.push({ labels: { __name__: 'container_memory_working_set_bytes', ...base }, points })
    }
  }
  if (want('kube_deployment_status_replicas_available'))
    for (const [key, st] of stepSeries(sim, 'available:')) {
      const [cluster = '', namespace = '', deployment = ''] = key
        .slice('available:'.length)
        .split('/')
      out.push({
        labels: {
          __name__: 'kube_deployment_status_replicas_available',
          cluster,
          namespace,
          deployment,
        },
        points: ts.map((t) => [t, valueAt(st, t)]),
      })
    }
  return out
}

/**
 * Every series of the named metrics (all of them if `names` is empty), sampled every `step` from `start`
 * to `end` (sim ms). Series with no samples in the window are left out, as Prometheus does.
 */
export function rangeSeries(
  sim: Simulator,
  start: number,
  end: number,
  step = STEP_MS,
  names: readonly string[] = [],
): Series[] {
  const want = (n: string) => names.length === 0 || names.includes(n)
  const ts = times(start, Math.min(end, sim.now), step)
  return [...requestSeries(sim, ts, want), ...podSeries(sim, ts, step, want)].filter(
    (s) => s.points.length > 0,
  )
}

/** Every series' value at one moment. */
export function instantSeries(sim: Simulator, t: number, names: readonly string[] = []): Series[] {
  return rangeSeries(sim, t, t, STEP_MS, names)
}
