import type { Simulator } from '../core/simulator.ts'
import { rangeQuery, type SeriesSource } from '../promql/evaluate.ts'
import { telemetrySource } from '../promql/source.ts'

/**
 * Alert rules (E8-07), as Prometheus runs them: the expression is evaluated every interval; each series it
 * returns is an alert, pending while it holds for less than `for`, firing once it has held that long, and
 * gone (inactive) when it stops returning.
 */
export interface AlertRule {
  name: string
  expr: string
  forMs: number
  labels: { severity: 'page' | 'ticket' | 'info' }
  annotations: { summary: string; description: string; runbook: string }
}

export type AlertState = 'inactive' | 'pending' | 'firing'

export interface Alert {
  rule: string
  labels: Record<string, string>
  state: Exclude<AlertState, 'inactive'>
  /** When the expression started returning this series. */
  activeAt: number
  value: number
}

export interface Transition {
  t: number
  rule: string
  labels: Record<string, string>
  from: AlertState
  to: AlertState
}

export const EVAL_INTERVAL_MS = 30_000
const RUNBOOKS = 'runbooks.ravenpost.example'

export const RULES: readonly AlertRule[] = [
  {
    name: 'RavenpostHighErrorRate',
    expr: 'sum by (service) (rate(http_server_requests_total{service="gate", http_response_status_code=~"5.."}[5m])) / sum by (service) (rate(http_server_requests_total{service="gate"}[5m])) > 0.05',
    forMs: 2 * 60_000,
    labels: { severity: 'page' },
    annotations: {
      summary: 'More than 5% of requests to the gate are failing.',
      description:
        'Users are seeing errors. Find which service the failures come from: the error ratio per service, then traces with status = error.',
      runbook: `${RUNBOOKS}/RavenpostHighErrorRate`,
    },
  },
  {
    name: 'RavenpostHighLatency',
    expr: 'histogram_quantile(0.99, sum by (service, le) (rate(http_server_request_duration_seconds_bucket{service="gate"}[5m]))) > 0.5',
    forMs: 5 * 60_000,
    labels: { severity: 'ticket' },
    annotations: {
      summary: 'The gate’s p99 latency is above 500 ms.',
      description:
        'Slow requests usually come from something the gate calls: compare p99 per service, then open a slow trace.',
      runbook: `${RUNBOOKS}/RavenpostHighLatency`,
    },
  },
  {
    name: 'KubeDeploymentReplicasUnavailable',
    expr: 'kube_deployment_status_replicas_available == 0',
    forMs: 60_000,
    labels: { severity: 'page' },
    annotations: {
      summary: 'A Deployment has no replica available.',
      description:
        'Nothing can serve its requests. Check its pods: kubectl get pods, then describe the failing one.',
      runbook: `${RUNBOOKS}/KubeDeploymentReplicasUnavailable`,
    },
  },
  {
    name: 'KubePodCrashLooping',
    expr: 'increase(kube_pod_container_status_restarts_total[10m]) > 1',
    forMs: 2 * 60_000,
    labels: { severity: 'ticket' },
    annotations: {
      summary: 'A container keeps restarting.',
      description:
        'Read why it stopped: kubectl describe pod (the last state) and kubectl logs --previous.',
      runbook: `${RUNBOOKS}/KubePodCrashLooping`,
    },
  },
  {
    name: 'ContainerMemoryNearLimit',
    expr: 'container_memory_working_set_bytes / ignoring(resource, unit) kube_pod_container_resource_limits > 0.9',
    forMs: 2 * 60_000,
    labels: { severity: 'ticket' },
    annotations: {
      summary: 'A container is using more than 90% of its memory limit.',
      description:
        'At 100% the kernel kills it (OOMKilled). Raise the limit, or find what’s using the memory.',
      runbook: `${RUNBOOKS}/ContainerMemoryNearLimit`,
    },
  },
]

const key = (l: Record<string, string>) =>
  JSON.stringify(Object.entries(l).sort(([a], [b]) => (a < b ? -1 : 1)))

export interface AlertTimeline {
  /** Every state change, oldest first. */
  transitions: Transition[]
  /** The alerts at the end of the window. */
  active: Alert[]
}

/**
 * Runs the rules over [start, end] every `EVAL_INTERVAL_MS`, as Prometheus would. Starts a little before
 * `start` (the longest `for`) so alerts already pending or firing at `start` show as such.
 */
export function evaluateRules(
  sim: Simulator,
  start: number,
  end: number,
  rules: readonly AlertRule[] = RULES,
  src: SeriesSource = telemetrySource(sim),
): AlertTimeline {
  const from =
    Math.floor((start - Math.max(...rules.map((r) => r.forMs))) / EVAL_INTERVAL_MS) *
    EVAL_INTERVAL_MS
  const transitions: Transition[] = []
  const active: Alert[] = []
  for (const rule of rules) {
    const r = rangeQuery(src, rule.expr, from, end, EVAL_INTERVAL_MS)
    // Which series held at each evaluation, with its value.
    const at = new Map<number, Map<string, { labels: Record<string, string>; value: number }>>()
    for (const s of r.series) {
      const labels = Object.fromEntries(Object.entries(s.labels).filter(([k]) => k !== '__name__'))
      for (const [t, v] of s.points) {
        const m = at.get(t) ?? new Map<string, { labels: Record<string, string>; value: number }>()
        m.set(key(labels), { labels, value: v })
        at.set(t, m)
      }
    }
    const state = new Map<string, Alert>()
    for (let t = from; t <= end; t += EVAL_INTERVAL_MS) {
      const now = at.get(t) ?? new Map<string, { labels: Record<string, string>; value: number }>()
      for (const [k, hit] of now) {
        const prev = state.get(k)
        const activeAt = prev?.activeAt ?? t
        const next: Alert['state'] = t - activeAt >= rule.forMs ? 'firing' : 'pending'
        if (!prev || prev.state !== next)
          transitions.push({
            t,
            rule: rule.name,
            labels: hit.labels,
            from: prev?.state ?? 'inactive',
            to: next,
          })
        state.set(k, {
          rule: rule.name,
          labels: hit.labels,
          state: next,
          activeAt,
          value: hit.value,
        })
      }
      for (const [k, a] of state)
        if (!now.has(k)) {
          transitions.push({ t, rule: rule.name, labels: a.labels, from: a.state, to: 'inactive' })
          state.delete(k)
        }
    }
    active.push(...state.values())
  }
  return {
    transitions: transitions
      .filter((x) => x.t >= start)
      .sort((a, b) => a.t - b.t || (a.rule < b.rule ? -1 : 1)),
    active,
  }
}
