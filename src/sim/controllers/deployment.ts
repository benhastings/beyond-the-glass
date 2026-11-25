import type { Cluster } from '../core/cluster.ts'
import { podTemplateHash } from '../core/names.ts'
import { ownerRef } from '../core/pods.ts'
import type { Deployment, PodTemplateSpec, ReplicaSet } from '../core/resources.ts'
import type { Controller, Simulator } from '../core/simulator.ts'
import {
  ownedReplicaSets,
  refreshDeploymentStatus,
  refreshReplicaSetStatus,
  scaledValue,
} from '../core/workloads.ts'

const REVISION = 'deployment.kubernetes.io/revision'
const HASH = 'pod-template-hash'

const revisionOf = (rs: ReplicaSet) => Number(rs.metadata.annotations?.[REVISION] ?? 0)

/** The template without the controller's own hash label: what the hash is computed from. */
function bareTemplate(t: PodTemplateSpec): PodTemplateSpec {
  const labels = Object.fromEntries(
    Object.entries(t.metadata.labels ?? {}).filter(([k]) => k !== HASH),
  )
  return { ...structuredClone(t), metadata: { ...t.metadata, labels } }
}

const dref = (d: Deployment) => ({
  kind: 'Deployment',
  name: d.metadata.name,
  namespace: d.metadata.namespace ?? 'default',
  uid: d.metadata.uid,
  apiVersion: 'apps/v1',
})

function scale(cluster: Cluster, d: Deployment, rs: ReplicaSet, to: number) {
  const from = rs.spec.replicas
  if (from === to) return
  rs.spec.replicas = to
  rs.metadata.annotations = {
    ...rs.metadata.annotations,
    'deployment.kubernetes.io/desired-replicas': String(d.spec.replicas),
  }
  cluster.put(rs)
  cluster.recordEvent(
    dref(d),
    'Normal',
    'ScalingReplicaSet',
    `Scaled ${to > from ? 'up' : 'down'} replica set ${rs.metadata.name} from ${String(from)} to ${String(to)}`,
    { component: 'deployment-controller' },
  )
}

/** The ReplicaSet for the Deployment's current template, created (or revived, on rollback) as needed. */
function newReplicaSet(
  sim: Simulator,
  cluster: Cluster,
  d: Deployment,
  sets: ReplicaSet[],
): ReplicaSet {
  const template = bareTemplate(d.spec.template)
  const hash = podTemplateHash(template, d.status.collisionCount ?? 0)
  const maxRevision = Math.max(0, ...sets.map(revisionOf))
  const existing = sets.find((rs) => rs.metadata.labels?.[HASH] === hash)
  if (existing) {
    // Rolling back to an older template revives its ReplicaSet with the next revision number.
    if (revisionOf(existing) < maxRevision) {
      existing.metadata.annotations = {
        ...existing.metadata.annotations,
        [REVISION]: String(maxRevision + 1),
      }
      cluster.put(existing)
    }
    return existing
  }
  const labels = { ...template.metadata.labels, [HASH]: hash }
  const maxSurge = scaledValue(d.spec.strategy.rollingUpdate?.maxSurge, d.spec.replicas, true)
  return cluster.put<'ReplicaSet'>({
    apiVersion: 'apps/v1',
    kind: 'ReplicaSet',
    metadata: {
      name: `${d.metadata.name}-${hash}`,
      namespace: d.metadata.namespace ?? 'default',
      uid: '',
      resourceVersion: '',
      generation: 1,
      creationTimestamp: sim.clock.iso(),
      labels,
      annotations: {
        'deployment.kubernetes.io/desired-replicas': String(d.spec.replicas),
        'deployment.kubernetes.io/max-replicas': String(d.spec.replicas + maxSurge),
        [REVISION]: String(maxRevision + 1),
      },
      ownerReferences: [ownerRef(d)],
    },
    spec: {
      replicas: 0,
      selector: { matchLabels: { ...d.spec.selector.matchLabels, [HASH]: hash } },
      template: { ...template, metadata: { ...template.metadata, labels } },
    },
    status: { replicas: 0 },
  })
}

/** One rolling-update step, the way kube-controller-manager computes it. */
function rollingUpdate(cluster: Cluster, d: Deployment, newRS: ReplicaSet, old: ReplicaSet[]) {
  const replicas = d.spec.replicas
  let maxSurge = scaledValue(d.spec.strategy.rollingUpdate?.maxSurge ?? '25%', replicas, true)
  let maxUnavailable = scaledValue(
    d.spec.strategy.rollingUpdate?.maxUnavailable ?? '25%',
    replicas,
    false,
  )
  if (maxSurge === 0 && maxUnavailable === 0) maxUnavailable = 1
  maxSurge = Math.max(0, maxSurge)

  // Scale the new ReplicaSet up as far as the surge allows.
  const total = () => [newRS, ...old].reduce((n, rs) => n + rs.spec.replicas, 0)
  if (newRS.spec.replicas > replicas) scale(cluster, d, newRS, replicas)
  else if (newRS.spec.replicas < replicas) {
    const up = Math.min(replicas + maxSurge - total(), replicas - newRS.spec.replicas)
    if (up > 0) scale(cluster, d, newRS, newRS.spec.replicas + up)
  }

  // Scale old ReplicaSets down as far as availability allows: unhealthy pods first, then oldest sets.
  const minAvailable = replicas - maxUnavailable
  const newUnavailable = newRS.spec.replicas - (newRS.status.availableReplicas ?? 0)
  let budget = total() - minAvailable - newUnavailable
  if (budget <= 0) return
  const oldest = [...old].sort((a, b) =>
    a.metadata.creationTimestamp < b.metadata.creationTimestamp ? -1 : 1,
  )
  for (const rs of oldest) {
    if (budget <= 0) break
    const unhealthy = Math.max(0, rs.spec.replicas - (rs.status.availableReplicas ?? 0))
    const cut = Math.min(unhealthy, budget, rs.spec.replicas)
    if (cut > 0) {
      scale(cluster, d, rs, rs.spec.replicas - cut)
      budget -= cut
    }
  }
  const available = [newRS, ...old].reduce((n, rs) => n + (rs.status.availableReplicas ?? 0), 0)
  let scaleDown = available - minAvailable
  for (const rs of oldest) {
    if (scaleDown <= 0) break
    const cut = Math.min(rs.spec.replicas, scaleDown)
    if (cut > 0) {
      scale(cluster, d, rs, rs.spec.replicas - cut)
      scaleDown -= cut
    }
  }
}

function recreate(cluster: Cluster, d: Deployment, newRS: ReplicaSet, old: ReplicaSet[]) {
  for (const rs of old) scale(cluster, d, rs, 0)
  const oldPodsLeft = old.some((rs) => rs.status.replicas > 0)
  if (!oldPodsLeft) scale(cluster, d, newRS, d.spec.replicas)
}

/** Removes the oldest scaled-down ReplicaSets beyond `revisionHistoryLimit`. */
function cleanup(cluster: Cluster, d: Deployment, old: ReplicaSet[]) {
  const idle = old
    .filter((rs) => rs.spec.replicas === 0 && rs.status.replicas === 0)
    .sort((a, b) => revisionOf(a) - revisionOf(b))
  for (const rs of idle.slice(0, Math.max(0, idle.length - d.spec.revisionHistoryLimit)))
    cluster.delete('ReplicaSet', rs.metadata.namespace, rs.metadata.name)
}

export const deploymentController: Controller = {
  name: 'deployment',
  reconcile: (sim: Simulator) => {
    for (const name of sim.clusterNames) {
      const cluster = sim.clusterByName(name)
      if (!cluster) continue
      for (const d of cluster.list('Deployment')) {
        if (d.spec.paused) continue
        const sets = ownedReplicaSets(cluster, d)
        for (const rs of sets) refreshReplicaSetStatus(cluster, rs)
        const newRS = newReplicaSet(sim, cluster, d, sets)
        const old = ownedReplicaSets(cluster, d).filter(
          (rs) => rs.metadata.uid !== newRS.metadata.uid,
        )
        if (d.spec.strategy.type === 'Recreate') recreate(cluster, d, newRS, old)
        else rollingUpdate(cluster, d, newRS, old)
        cleanup(cluster, d, old)
        d.metadata.annotations = {
          ...d.metadata.annotations,
          [REVISION]: newRS.metadata.annotations?.[REVISION] ?? '1',
        }
        const rolling =
          old.some((rs) => rs.spec.replicas > 0 || rs.status.replicas > 0) ||
          (newRS.status.availableReplicas ?? 0) < d.spec.replicas
        refreshDeploymentStatus(
          cluster,
          d,
          sim.clock.iso(),
          rolling ? newRS.metadata.name : undefined,
        )
      }
    }
  },
}

/**
 * `kubectl rollout undo`: puts the template of an earlier revision back (default: the previous one).
 * Returns the revision rolled back to, or an error message in kubectl's words.
 */
export function rollbackDeployment(
  sim: Simulator,
  cluster: Cluster,
  d: Deployment,
  toRevision?: number,
): { revision: number } | { error: string } {
  const sets = ownedReplicaSets(cluster, d).sort((a, b) => revisionOf(b) - revisionOf(a))
  const current = revisionOf(sets[0] ?? ({} as ReplicaSet))
  const target = toRevision
    ? sets.find((rs) => revisionOf(rs) === toRevision)
    : sets.find((rs) => revisionOf(rs) < current)
  if (!target)
    return {
      error: toRevision
        ? `error: unable to find specified revision ${String(toRevision)} in history`
        : 'error: no rollout history found for deployment',
    }
  const revision = revisionOf(target)
  d.spec.template = bareTemplate(target.spec.template)
  d.metadata.generation = (d.metadata.generation ?? 1) + 1
  cluster.put(d)
  sim.reconcile()
  return { revision }
}
