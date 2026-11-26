import { behaviourOf } from '../core/behaviour.ts'
import type { Simulator } from '../core/simulator.ts'
import { fnv1a32 } from '../core/rng.ts'
import type { ContainerStatus, Pod } from '../core/resources.ts'
import { spansServedBy } from './traces.ts'

/**
 * The single source of container logs (E6-06). `kubectl logs` reads it, and so must the Loki log explorer
 * (E8-04), so both always show the same lines for the same window ("one timeline, many views").
 * Lines are derived, not stored: each container run writes its startup lines, its behaviour's lines and,
 * while it keeps running, a request line every 30 seconds.
 */

export interface LogLine {
  /** Sim time (ms since scenario start). */
  t: number
  text: string
}

/** One run of a container, from start until it stopped (or now). */
export interface ContainerRun {
  start: number
  end: number
  /** Ended by a crash or kill (as opposed to still running). */
  exited: boolean
  reason?: string
}

/** Like kubelet's log rotation, only the most recent lines of a run are kept. */
export const MAX_LINES = 1000
export const REQUEST_EVERY_MS = 30_000

const at = (sim: Simulator, iso: string) => Date.parse(iso) - sim.clock.epochMs

/** The current run (or the last one, while it waits to restart) and the previous one, if any. */
export function runsOf(
  sim: Simulator,
  cs: ContainerStatus,
): { current?: ContainerRun; previous?: ContainerRun } {
  const last = cs.lastState.terminated
  const lastRun = last?.startedAt
    ? {
        start: at(sim, last.startedAt),
        end: at(sim, last.finishedAt ?? last.startedAt),
        exited: true,
        ...(last.reason ? { reason: last.reason } : {}),
      }
    : undefined
  if (cs.state.running) {
    const current = { start: at(sim, cs.state.running.startedAt), end: sim.now, exited: false }
    return lastRun ? { current, previous: lastRun } : { current }
  }
  // Waiting after a crash: the dead container is still the one `kubectl logs` reads; there's no older one kept.
  if (lastRun) return { current: lastRun, previous: lastRun }
  return {}
}

const tag = (image: string) => /:([^/:@]+)$/.exec(image)?.[1] ?? 'latest'
const json = (o: Record<string, unknown>) => JSON.stringify(o)
const iso = (sim: Simulator, t: number) => new Date(sim.clock.epochMs + t).toISOString()

const PATHS = ['/messages', '/messages/send', '/recipients', '/healthz', '/ready'] as const

/** The lines one run of a container wrote, in order. */
export function runLines(
  sim: Simulator,
  pod: Pod,
  container: string,
  run: ContainerRun,
): LogLine[] {
  const spec = pod.spec.containers.find((c) => c.name === container)
  const b = behaviourOf(sim, pod, container)
  const lines: LogLine[] = []
  const add = (t: number, o: Record<string, unknown>) => {
    if (t <= run.end) lines.push({ t, text: json({ level: 'info', ts: iso(sim, t), ...o }) })
  }
  add(run.start + 40, { msg: `starting ${container}`, version: tag(spec?.image ?? '') })
  ;(b.log ?? []).forEach((text, i) => {
    const t = run.start + 120 + i * 15
    if (t <= run.end) lines.push({ t, text })
  })
  // A run that stopped with required config missing says why last (E10-02).
  if (run.exited && b.requires?.length && run.reason !== 'OOMKilled')
    lines.push({
      t: Math.max(run.start, run.end - 5),
      text: json({
        level: 'fatal',
        ts: iso(sim, Math.max(run.start, run.end - 5)),
        msg: `missing required config key ${b.requires.map((r) => `${r.key} (ConfigMap ${r.configMap})`).join(', ')}`,
        exit_code: 1,
      }),
    })
  const port = spec?.ports?.[0]?.containerPort
  if (port && !run.exited) add(run.start + 300, { msg: 'listening', addr: `:${String(port)}` })
  if (!run.exited || run.end - run.start > REQUEST_EVERY_MS) {
    // Periodic request lines, deterministic per pod and run; only the newest MAX_LINES are kept.
    const first = Math.max(run.start + REQUEST_EVERY_MS, run.end - REQUEST_EVERY_MS * MAX_LINES)
    const from = run.start + Math.ceil((first - run.start) / REQUEST_EVERY_MS) * REQUEST_EVERY_MS
    // With a telemetry topology (E8-01), each line describes a request this pod really served in a
    // sampled trace: same status, duration and IDs, so logs and traces agree.
    const traced = sim.scenario.telemetry?.services.length
      ? spansServedBy(sim, pod.metadata.name, container, from - REQUEST_EVERY_MS, run.end + 1)
      : []
    for (let t = from; t <= run.end; t += REQUEST_EVERY_MS) {
      const span = traced.find((s) => s.start >= t - REQUEST_EVERY_MS && s.start < t)
      if (span) {
        const code = span.attributes['http.response.status_code']
        add(t, {
          ...(span.status.code === 'STATUS_CODE_ERROR' ? { level: 'error' } : {}),
          msg:
            span.status.code === 'STATUS_CODE_ERROR'
              ? (span.status.message ?? 'request failed')
              : 'request',
          ...(typeof span.attributes['http.request.method'] === 'string'
            ? {
                method: span.attributes['http.request.method'],
                path: span.attributes['http.route'],
              }
            : { operation: span.name }),
          ...(code !== undefined ? { status: code } : {}),
          duration_ms: Math.round(span.end - span.start),
          trace_id: span.traceId,
          span_id: span.spanId,
        })
        continue
      }
      const h = fnv1a32(`${pod.metadata.uid}/${container}/${String(t)}`)
      add(t, {
        msg: 'request',
        method: h % 5 === 0 ? 'POST' : 'GET',
        path: PATHS[h % PATHS.length],
        status: 200,
        duration_ms: 5 + (h % 60),
      })
    }
  }
  return lines.slice(-MAX_LINES)
}

export type LogsResult = { ok: true; lines: LogLine[] } | { ok: false; error: string }

/** What `kubectl logs` would return for one container, as lines or kubectl's error. */
export function containerLogs(
  sim: Simulator,
  pod: Pod,
  container: string,
  opts: { previous?: boolean } = {},
): LogsResult {
  const cs = pod.status.containerStatuses?.find((c) => c.name === container)
  const runs = cs ? runsOf(sim, cs) : {}
  const name = pod.metadata.name
  if (opts.previous) {
    if (!runs.previous)
      return {
        ok: false,
        error: `Error from server (BadRequest): previous terminated container "${container}" in pod "${name}" not found`,
      }
    return { ok: true, lines: runLines(sim, pod, container, runs.previous) }
  }
  if (!runs.current) {
    const reason = cs?.state.waiting?.reason ?? 'ContainerCreating'
    const why =
      reason === 'ImagePullBackOff' || reason === 'ErrImagePull'
        ? 'trying and failing to pull image'
        : reason
    return {
      ok: false,
      error: `Error from server (BadRequest): container "${container}" in pod "${name}" is waiting to start: ${why}`,
    }
  }
  return { ok: true, lines: runLines(sim, pod, container, runs.current) }
}

/**
 * Every line a pod's containers wrote in [from, to] (sim ms), oldest first, across the current and
 * previous runs. This is the query the log explorer (E8-04) makes; `kubectl logs` reads the same lines.
 */
export function logsInWindow(
  sim: Simulator,
  pod: Pod,
  container: string,
  from: number,
  to: number,
): LogLine[] {
  const cs = pod.status.containerStatuses?.find((c) => c.name === container)
  if (!cs) return []
  const { current, previous } = runsOf(sim, cs)
  const runs = [previous, current].filter(
    (r, i, all): r is ContainerRun => r !== undefined && all.indexOf(r) === i,
  )
  return runs
    .flatMap((r) => runLines(sim, pod, container, r))
    .filter((l) => l.t >= from && l.t <= to)
}
