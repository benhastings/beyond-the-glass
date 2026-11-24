import { isPodReady, type Cluster } from './cluster.ts'
import { condition } from './pods.ts'
import type { Deployment, ReplicaSet } from './resources.ts'
import { matchesSelector } from './selectors.ts'

/** Resolves `maxUnavailable`/`maxSurge` (an int or a percentage) against `replicas`. */
export function scaledValue(
  value: number | string | undefined,
  replicas: number,
  roundUp: boolean,
): number {
  if (value === undefined) return 0
  if (typeof value === 'number') return value
  const pct = /^(\d+)%$/.exec(value)
  if (!pct) return Number(value) || 0
  const raw = (Number(pct[1]) * replicas) / 100
  return roundUp ? Math.ceil(raw) : Math.floor(raw)
}

export function ownedPods(cluster: Cluster, rs: ReplicaSet) {
  return cluster
    .list('Pod', { namespace: rs.metadata.namespace ?? 'default' })
    .filter(
      (p) =>
        p.metadata.ownerReferences?.some((o) => o.uid === rs.metadata.uid) &&
        matchesSelector(p.metadata.labels, rs.spec.selector),
    )
}

export function ownedReplicaSets(cluster: Cluster, d: Deployment) {
  return cluster
    .list('ReplicaSet', { namespace: d.metadata.namespace ?? 'default' })
    .filter((rs) => rs.metadata.ownerReferences?.some((o) => o.uid === d.metadata.uid))
}

/** Recomputes a ReplicaSet's status from its pods. */
export function refreshReplicaSetStatus(cluster: Cluster, rs: ReplicaSet): void {
  const pods = ownedPods(cluster, rs).filter((p) => !p.metadata.deletionTimestamp)
  const ready = pods.filter(isPodReady).length
  rs.status = {
    replicas: pods.length,
    fullyLabeledReplicas: pods.length,
    readyReplicas: ready,
    availableReplicas: ready,
    observedGeneration: rs.metadata.generation ?? 1,
  }
  cluster.put(rs)
}

/** Recomputes a Deployment's status and Available/Progressing conditions from its ReplicaSets. */
export function refreshDeploymentStatus(cluster: Cluster, d: Deployment, now: string): void {
  const sets = ownedReplicaSets(cluster, d)
  const current = sets.find(
    (rs) =>
      rs.metadata.annotations?.['deployment.kubernetes.io/revision'] ===
      d.metadata.annotations?.['deployment.kubernetes.io/revision'],
  )
  const sum = (f: (rs: ReplicaSet) => number | undefined) =>
    sets.reduce((n, rs) => n + (f(rs) ?? 0), 0)
  const replicas = sum((rs) => rs.status.replicas)
  const ready = sum((rs) => rs.status.readyReplicas)
  const available = sum((rs) => rs.status.availableReplicas)
  const updated = current?.status.replicas ?? 0
  const maxUnavailable = scaledValue(
    d.spec.strategy.rollingUpdate?.maxUnavailable,
    d.spec.replicas,
    false,
  )
  const isAvailable = available >= d.spec.replicas - maxUnavailable
  const prev = d.status.conditions ?? []
  const keep = (type: string, status: boolean) => {
    const old = prev.find((c) => c.type === type)
    return old && old.status === (status ? 'True' : 'False') ? (old.lastTransitionTime ?? now) : now
  }
  d.status = {
    observedGeneration: d.metadata.generation ?? 1,
    replicas,
    updatedReplicas: updated,
    readyReplicas: ready,
    availableReplicas: available,
    ...(replicas - available > 0 ? { unavailableReplicas: replicas - available } : {}),
    conditions: [
      condition('Available', isAvailable, keep('Available', isAvailable), {
        lastUpdateTime: now,
        reason: isAvailable ? 'MinimumReplicasAvailable' : 'MinimumReplicasUnavailable',
        message: isAvailable
          ? 'Deployment has minimum availability.'
          : 'Deployment does not have minimum availability.',
      }),
      condition('Progressing', true, keep('Progressing', true), {
        lastUpdateTime: now,
        reason: 'NewReplicaSetAvailable',
        message: `ReplicaSet "${current?.metadata.name ?? d.metadata.name}" has successfully progressed.`,
      }),
    ],
  }
  cluster.put(d)
}
