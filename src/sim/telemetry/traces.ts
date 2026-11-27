import { fnv1a32 } from '../core/rng.ts'
import type { Simulator } from '../core/simulator.ts'
import {
  modelAt,
  modelContext,
  runningAt,
  sampleLatency,
  STEP_MS,
  unit,
  type ModelContext,
  type ServiceSpec,
} from './model.ts'

/**
 * Traces (E8-01): one sampled request per entry service per 15-second bucket, through every service it
 * calls. A trace ID encodes its bucket and entry service, so any ID can be rebuilt on demand. Spans are
 * served by a pod that was really running then; a call to a service with no ready endpoints ends there
 * with a 503. The shapes follow OTLP's JSON.
 */
export interface Span {
  traceId: string
  spanId: string
  parentSpanId?: string
  name: string
  kind: 'SPAN_KIND_SERVER' | 'SPAN_KIND_CLIENT' | 'SPAN_KIND_CONSUMER'
  /** Sim ms. */
  start: number
  end: number
  service: string
  namespace: string
  /** The pod that served it (none when nothing could). */
  pod?: string
  container?: string
  attributes: Record<string, string | number>
  status: { code: 'STATUS_CODE_UNSET' | 'STATUS_CODE_OK' | 'STATUS_CODE_ERROR'; message?: string }
  events: { name: string; time: number; attributes: Record<string, string> }[]
}

export interface Trace {
  traceId: string
  rootService: string
  start: number
  durationMs: number
  error: boolean
  spans: Span[]
}

const hex = (n: number, width: number) => (n >>> 0).toString(16).padStart(width, '0').slice(-width)
const OFFSET = 2 ** 31

/** A trace ID: 16 hex of hash, then the bucket and the entry service. */
export function traceIdFor(sim: Simulator, entryIndex: number, bucket: number): string {
  return `${hex(fnv1a32(`${String(sim.scenario.seed)}/trace/${String(entryIndex)}/${String(bucket)}`), 8)}${hex(fnv1a32(`${String(bucket)}/${String(entryIndex)}`), 8)}${hex(bucket + OFFSET, 8)}${hex(entryIndex, 8)}`
}

const spanIdFor = (traceId: string, path: string) =>
  `${hex(fnv1a32(`${traceId}/${path}`), 8)}${hex(fnv1a32(`${path}/${traceId}`), 8)}`

/**
 * A new trace ID for a call made without context propagation: a fresh first half, the same bucket and entry
 * (so `trace()` can still find and rebuild it).
 */
const brokenTraceId = (traceId: string, path: string) =>
  `${hex(fnv1a32(`${traceId}/${path}/new`), 8)}${hex(fnv1a32(`new/${path}/${traceId}`), 8)}${traceId.slice(16)}`

/**
 * One sampled request from `entry`, as the trace it starts, plus a trace for every call made by a service
 * that doesn't propagate context (E9-10): those start over, with no parent.
 */
function build(
  sim: Simulator,
  entry: ServiceSpec,
  entryIndex: number,
  bucket: number,
  ctx: ModelContext,
): Trace[] {
  const rootTraceId = traceIdFor(sim, entryIndex, bucket)
  const traceId = rootTraceId
  const t0 = bucket * STEP_MS + Math.floor(unit(traceId, 'offset') * 1000)
  const model = modelAt(sim, bucket * STEP_MS, ctx)
  const byName = ctx.byName
  const spans: Span[] = []
  /** Serves one request to `s` at `start`; returns its span (already pushed). */
  const serve = (
    s: ServiceSpec,
    start: number,
    parent: string | undefined,
    path: string,
    depth: number,
    tid: string = traceId,
  ): Span => {
    const m = model.get(s.name)
    const pods = runningAt(ctx, s, start)
    const spanId = spanIdFor(tid, path)
    const span: Span = {
      traceId: tid,
      spanId,
      ...(parent ? { parentSpanId: parent } : {}),
      name: s.operation,
      kind: s.kind === 'worker' || s.kind === 'queue' ? 'SPAN_KIND_CONSUMER' : 'SPAN_KIND_SERVER',
      start,
      end: start,
      service: s.name,
      namespace: s.namespace,
      attributes: {},
      status: { code: 'STATUS_CODE_UNSET' },
      events: [],
    }
    spans.push(span)
    const pick = pods[Math.floor(unit(traceId, path, 'pod') * pods.length)]
    if (pick) {
      span.pod = pick.pod
      span.container = pick.container
    }
    // Its own work, then each call in turn.
    // Its own work (its median less its calls'), half before the calls and half after.
    const callMedian = s.calls.reduce(
      (n, c) => n + (byName.has(c) ? (model.get(c)?.median ?? 0) : 0),
      0,
    )
    const own = sampleLatency(
      Math.max(0.5, (m?.median ?? s.latencyMs) - callMedian),
      unit(traceId, path, 'own'),
    )
    let cursor = start + own / 2
    let failed: { code: number; message: string } | undefined
    if (m?.unavailable === 1 || !pick)
      failed = { code: 503, message: `no endpoints available for service "${s.name}"` }
    if (!failed && depth < 20)
      for (const [i, c] of s.calls.entries()) {
        const callee = byName.get(c)
        if (!callee) continue
        const childPath = `${path}/${String(i)}`
        const child = s.propagates
          ? serve(callee, cursor, spanId, childPath, depth + 1, tid)
          : serve(callee, cursor, undefined, childPath, depth + 1, brokenTraceId(tid, childPath))
        cursor = child.end
        if (child.status.code === 'STATUS_CODE_ERROR') {
          failed = { code: 500, message: `${callee.name}: ${child.status.message ?? 'error'}` }
          break
        }
      }
    if (
      !failed &&
      unit(traceId, path, 'err') < Math.max(0, (m?.err ?? 0) - callsErr(s, model, byName))
    )
      failed = { code: 500, message: 'internal error' }
    span.end = failed?.code === 503 ? start + 1 : cursor + own / 2
    const code = failed?.code ?? 200
    span.attributes =
      s.kind === 'db'
        ? {
            'db.system': 'postgresql',
            'db.operation.name': s.operation.split(' ')[0] ?? s.operation,
            'server.address': `${s.name}.${s.namespace}.svc`,
          }
        : s.kind === 'queue'
          ? {
              'messaging.system': 'redis',
              'messaging.operation.type': 'publish',
              'server.address': `${s.name}.${s.namespace}.svc`,
            }
          : {
              'http.request.method': s.operation.split(' ')[0] ?? 'GET',
              'http.route': s.operation.split(' ')[1] ?? '/',
              'http.response.status_code': code,
              'server.address': `${s.name}.${s.namespace}.svc`,
            }
    if (failed) {
      span.status = { code: 'STATUS_CODE_ERROR', message: failed.message }
      span.events.push({
        name: 'exception',
        time: span.end,
        attributes: {
          'exception.type': code === 503 ? 'UnavailableError' : 'Error',
          'exception.message': failed.message,
        },
      })
    } else span.status = { code: 'STATUS_CODE_UNSET' }
    return span
  }
  serve(entry, t0, undefined, '0', 0)
  // One trace per trace ID, in the order they started (the request's own first).
  const ids = [...new Set(spans.map((x) => x.traceId))]
  return ids.map((id) => {
    const own = spans.filter((x) => x.traceId === id)
    const root = own.find((x) => !x.parentSpanId) ?? own[0]
    return {
      traceId: id,
      rootService: root?.service ?? entry.name,
      start: root?.start ?? t0,
      durationMs: (root?.end ?? t0) - (root?.start ?? t0),
      error: own.some((x) => x.status.code === 'STATUS_CODE_ERROR'),
      spans: own,
    }
  })
}

/** The failure share a service inherits from its calls. */
function callsErr(
  s: ServiceSpec,
  model: Map<string, { err: number }>,
  byName: Map<string, ServiceSpec>,
): number {
  let ok = 1
  for (const c of s.calls) if (byName.has(c)) ok *= 1 - (model.get(c)?.err ?? 0)
  return 1 - ok
}

/** Rebuilds a trace from its ID; undefined for IDs this simulation never made (or from the future). */
export function trace(sim: Simulator, traceId: string): Trace | undefined {
  if (!/^[0-9a-f]{32}$/.test(traceId)) return undefined
  const bucket = parseInt(traceId.slice(16, 24), 16) - OFFSET
  const entryIndex = parseInt(traceId.slice(24), 16)
  const ctx = modelContext(sim)
  const entry = ctx.entries[entryIndex]
  if (!entry || bucket * STEP_MS > sim.now) return undefined
  return build(sim, entry, entryIndex, bucket, ctx).find((t) => t.traceId === traceId)
}

/**
 * Built traces per simulation and bucket. History only changes at or after `now`, so a bucket that ended
 * two buckets before `now` is final: its traces are kept and reused (log lines ask for them often).
 */
const built = new WeakMap<Simulator, Map<number, Trace[]>>()

/** Every sampled trace that started in [start, end], oldest first. */
export function tracesInWindow(sim: Simulator, start: number, end: number): Trace[] {
  let ctx: ModelContext | undefined
  const cache = built.get(sim) ?? new Map<number, Trace[]>()
  built.set(sim, cache)
  const out: Trace[] = []
  for (let b = Math.floor(start / STEP_MS); b * STEP_MS <= Math.min(end, sim.now); b++) {
    let traces = cache.get(b)
    if (!traces) {
      ctx ??= modelContext(sim)
      const c = ctx
      traces = c.entries.flatMap((e, i) => build(sim, e, i, b, c))
      if ((b + 2) * STEP_MS <= sim.now) cache.set(b, traces)
    }
    for (const t of traces)
      if (t.start >= start && t.start <= end && t.start <= sim.now) out.push(t)
  }
  return out
}

/** The trace as OTLP JSON (`resourceSpans` grouped by service and pod). */
export function toOtlp(sim: Simulator, t: Trace) {
  const nanos = (ms: number) =>
    (BigInt(Math.round((sim.clock.epochMs + ms) * 1000)) * 1000n).toString()
  const groups = new Map<string, Span[]>()
  for (const s of t.spans) {
    const key = `${s.service}/${s.pod ?? ''}`
    groups.set(key, [...(groups.get(key) ?? []), s])
  }
  return {
    resourceSpans: [...groups.values()].map((spans) => {
      const first = spans[0]
      return {
        resource: {
          attributes: [
            { key: 'service.name', value: { stringValue: first?.service ?? '' } },
            { key: 'k8s.namespace.name', value: { stringValue: first?.namespace ?? '' } },
            ...(first?.pod ? [{ key: 'k8s.pod.name', value: { stringValue: first.pod } }] : []),
          ],
        },
        scopeSpans: [
          {
            scope: { name: 'ravenpost.instrumentation', version: '1.0.0' },
            spans: spans.map((s) => ({
              traceId: s.traceId,
              spanId: s.spanId,
              ...(s.parentSpanId ? { parentSpanId: s.parentSpanId } : {}),
              name: s.name,
              kind: s.kind,
              startTimeUnixNano: nanos(s.start),
              endTimeUnixNano: nanos(s.end),
              attributes: Object.entries(s.attributes).map(([key, v]) => ({
                key,
                value: typeof v === 'number' ? { intValue: String(v) } : { stringValue: v },
              })),
              events: s.events.map((e) => ({
                name: e.name,
                timeUnixNano: nanos(e.time),
                attributes: Object.entries(e.attributes).map(([key, v]) => ({
                  key,
                  value: { stringValue: v },
                })),
              })),
              status: {
                code: s.status.code,
                ...(s.status.message ? { message: s.status.message } : {}),
              },
            })),
          },
        ],
      }
    }),
  }
}

/** Exemplars for a service's latency histogram: each sampled span of it, with its trace. */
export function exemplars(
  sim: Simulator,
  service: string,
  start: number,
  end: number,
): { t: number; value: number; traceId: string }[] {
  return tracesInWindow(sim, start, end).flatMap((t) =>
    t.spans
      .filter((s) => s.service === service)
      .map((s) => ({ t: s.start, value: (s.end - s.start) / 1000, traceId: t.traceId })),
  )
}

/** The spans a pod's container served in [from, to): what its request log lines describe. */
export function spansServedBy(
  sim: Simulator,
  pod: string,
  container: string,
  from: number,
  to: number,
): Span[] {
  return tracesInWindow(sim, from - STEP_MS, to).flatMap((t) =>
    t.spans.filter(
      (s) => s.pod === pod && s.container === container && s.start >= from && s.start < to,
    ),
  )
}
