import type { Pod } from '../core/resources.ts'
import type { Controller, Simulator } from '../core/simulator.ts'

/**
 * What the telemetry generator (E8-01) needs to know about the past: every container run (with how it
 * ended), and step series that change only when the cluster does: restarts, available replicas, ready
 * endpoints, traffic. The simulator is discrete-event, so recording on every reconcile is exact. It's kept
 * in the simulation's state, so snapshots carry it, and it grows with changes, not with time.
 */
export interface Run {
  start: number
  end?: number
  /** Why it ended: `OOMKilled`, `Error`, `Completed`, `Deleted`. */
  reason?: string
}

export interface ContainerHistory {
  cluster: string
  namespace: string
  pod: string
  container: string
  /** The Deployment the pod belongs to (through its ReplicaSet), if any. */
  deployment?: string
  image: string
  /** Memory limit in bytes (0: none). */
  limit: number
  runs: Run[]
}

/** A value that changes in steps: `[time, value]`, in time order, each different from the one before. */
export type Steps = [number, number][]

interface HistoryState extends Record<string, unknown> {
  containers: Record<string, ContainerHistory>
  steps: Record<string, Steps>
}

export const HISTORY = 'telemetry-history'
const MI = 1024 ** 2

const state = (sim: Simulator) =>
  sim.state<HistoryState>(HISTORY, () => ({ containers: {}, steps: {} }))
const at = (sim: Simulator, iso: string) => Date.parse(iso) - sim.clock.epochMs

export const containerKey = (cluster: string, namespace: string, pod: string, container: string) =>
  `${cluster}/${namespace}/${pod}/${container}`
export const stepKey = (what: string, cluster: string, namespace: string, name: string) =>
  `${what}:${cluster}/${namespace}/${name}`

/** Every container ever seen. */
export const containerHistories = (sim: Simulator): ContainerHistory[] =>
  Object.values(state(sim).containers)
export const steps = (sim: Simulator, key: string): Steps => state(sim).steps[key] ?? []
/** Every step series whose key starts with `prefix` (`available:`, `endpoints:`, …). */
export const stepSeries = (sim: Simulator, prefix: string): [string, Steps][] =>
  Object.entries(state(sim).steps).filter(([k]) => k.startsWith(prefix))

/** The step series' value at `t` (the first value before the first change; `fallback` if none). */
export function valueAt(s: Steps, t: number, fallback = 0): number {
  if (s.length === 0) return fallback
  let lo = 0
  let hi = s.length - 1
  if (t < (s[0]?.[0] ?? 0)) return s[0]?.[1] ?? fallback
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if ((s[mid]?.[0] ?? 0) <= t) lo = mid
    else hi = mid - 1
  }
  return s[lo]?.[1] ?? fallback
}

function record(st: HistoryState, key: string, t: number, v: number): void {
  const s = (st.steps[key] ??= [])
  const last = s.at(-1)
  if (last?.[1] === v) return
  if (last?.[0] === t) last[1] = v
  else s.push([t, v])
}

const parseMemory = (q: string | undefined): number => {
  if (!q) return 0
  const m = /^(\d+(?:\.\d+)?)(Ki|Mi|Gi|K|M|G)?$/.exec(q)
  if (!m) return 0
  const unit = { Ki: 1024, Mi: MI, Gi: 1024 ** 3, K: 1e3, M: 1e6, G: 1e9 }[m[2] ?? ''] ?? 1
  return Math.round(Number(m[1]) * unit)
}

const deploymentOf = (pod: Pod): string | undefined => {
  const rs = pod.metadata.ownerReferences?.find((o) => o.kind === 'ReplicaSet')?.name
  return rs?.replace(/-[a-z0-9]{8,10}$/, '')
}

/** Records what changed since the last reconcile. */
export function recordHistory(sim: Simulator): void {
  const st = state(sim)
  const now = sim.now
  const seen = new Set<string>()
  for (const cluster of sim.scenario.clusters.map((c) => sim.clusterByName(c.name))) {
    if (!cluster) continue
    for (const pod of cluster.list('Pod')) {
      const ns = pod.metadata.namespace ?? 'default'
      for (const cs of pod.status.containerStatuses ?? []) {
        const key = containerKey(cluster.name, ns, pod.metadata.name, cs.name)
        seen.add(key)
        const spec = pod.spec.containers.find((c) => c.name === cs.name)
        const dep = deploymentOf(pod)
        const h = (st.containers[key] ??= {
          cluster: cluster.name,
          namespace: ns,
          pod: pod.metadata.name,
          container: cs.name,
          ...(dep ? { deployment: dep } : {}),
          image: spec?.image ?? '',
          limit: parseMemory(spec?.resources?.limits?.memory),
          runs: [],
        })
        h.image = spec?.image ?? h.image
        const open = h.runs.at(-1)?.end === undefined ? h.runs.at(-1) : undefined
        // The run that ended (now, or before we looked).
        const ended = cs.state.terminated ?? cs.lastState.terminated
        if (open && ended?.startedAt && at(sim, ended.startedAt) === open.start) {
          open.end = ended.finishedAt ? at(sim, ended.finishedAt) : now
          if (ended.reason) open.reason = ended.reason
        } else if (
          !open &&
          ended?.startedAt &&
          !h.runs.some((r) => r.start === at(sim, ended.startedAt ?? ''))
        ) {
          // A run that ended before the scenario began (its history).
          h.runs.push({
            start: at(sim, ended.startedAt),
            end: at(sim, ended.finishedAt ?? ended.startedAt),
            ...(ended.reason ? { reason: ended.reason } : {}),
          })
        }
        const running = cs.state.running ? at(sim, cs.state.running.startedAt) : undefined
        const current = h.runs.at(-1)
        if (running !== undefined && !(current && current.start === running)) {
          if (current && current.end === undefined) current.end = running
          h.runs.push({ start: running })
        }
        if (pod.metadata.deletionTimestamp && h.runs.at(-1)?.end === undefined) {
          const last = h.runs.at(-1)
          if (last) {
            last.end = now
            last.reason ??= 'Deleted'
          }
        }
        record(
          st,
          stepKey('restarts', cluster.name, ns, `${pod.metadata.name}/${cs.name}`),
          now,
          cs.restartCount,
        )
      }
    }
    for (const d of cluster.list('Deployment'))
      record(
        st,
        stepKey('available', cluster.name, d.metadata.namespace ?? 'default', d.metadata.name),
        now,
        d.status.availableReplicas ?? 0,
      )
    for (const svc of cluster.list('Service')) {
      const ns = svc.metadata.namespace ?? 'default'
      const ep = cluster.endpointsFor(svc)
      record(
        st,
        stepKey('endpoints', cluster.name, ns, svc.metadata.name),
        now,
        ep.subsets.reduce((n, s) => n + (s.addresses?.length ?? 0), 0),
      )
      const traffic = sim.traffic(cluster.name, ns, svc.metadata.name)
      record(
        st,
        stepKey('latency', cluster.name, ns, svc.metadata.name),
        now,
        traffic.latencyMs ?? 0,
      )
      record(st, stepKey('rps', cluster.name, ns, svc.metadata.name), now, traffic.rps ?? -1)
      record(
        st,
        stepKey('errors', cluster.name, ns, svc.metadata.name),
        now,
        traffic.errorRate ?? 0,
      )
    }
  }
  // Pods that are gone: their last run ended now.
  for (const [key, h] of Object.entries(st.containers)) {
    const last = h.runs.at(-1)
    if (!seen.has(key) && last && last.end === undefined) {
      last.end = now
      last.reason = 'Deleted'
    }
  }
}

export const historyController: Controller = {
  name: HISTORY,
  reconcile: recordHistory,
}
