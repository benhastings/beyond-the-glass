import type { Cluster } from '../core/cluster.ts'
import { isPodReady } from '../core/cluster.ts'
import { nameSuffix } from '../core/names.ts'
import { ownerRef } from '../core/pods.ts'
import type { Pod, ReplicaSet } from '../core/resources.ts'
import type { Controller, Simulator } from '../core/simulator.ts'
import { ownedPods, refreshReplicaSetStatus } from '../core/workloads.ts'

const ref = (rs: ReplicaSet) => ({
  kind: 'ReplicaSet',
  name: rs.metadata.name,
  namespace: rs.metadata.namespace ?? 'default',
  uid: rs.metadata.uid,
  apiVersion: 'apps/v1',
})

/** A new, unscheduled pod from the ReplicaSet's template (the scheduler and kubelet take it from here). */
function createPod(sim: Simulator, cluster: Cluster, rs: ReplicaSet): Pod {
  const ns = rs.metadata.namespace ?? 'default'
  const t = rs.spec.template
  return cluster.put<'Pod'>({
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: {
      name: `${rs.metadata.name}-${nameSuffix(sim.rng)}`,
      generateName: `${rs.metadata.name}-`,
      namespace: ns,
      uid: '',
      resourceVersion: '',
      creationTimestamp: sim.clock.iso(),
      labels: { ...t.metadata.labels },
      ...(t.metadata.annotations ? { annotations: { ...t.metadata.annotations } } : {}),
      ownerReferences: [ownerRef(rs)],
    },
    spec: {
      restartPolicy: 'Always',
      terminationGracePeriodSeconds: 30,
      serviceAccountName: 'default',
      ...structuredClone(t.spec),
    },
    status: { phase: 'Pending', qosClass: 'Burstable' },
  })
}

/** Which pods a ReplicaSet removes first when scaling down: unscheduled, then not ready, then newest. */
export function deletionOrder(pods: Pod[]): Pod[] {
  const rank = (p: Pod) => (!p.spec.nodeName ? 0 : !isPodReady(p) ? 1 : 2)
  return [...pods].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (a.metadata.creationTimestamp > b.metadata.creationTimestamp
        ? -1
        : a.metadata.creationTimestamp < b.metadata.creationTimestamp
          ? 1
          : 0) ||
      (a.metadata.name < b.metadata.name ? -1 : 1),
  )
}

/** Keeps each ReplicaSet's pod count at its desired replicas. */
export const replicaSetController: Controller = {
  name: 'replicaset',
  reconcile: (sim: Simulator) => {
    for (const name of sim.clusterNames) {
      const cluster = sim.clusterByName(name)
      if (!cluster) continue
      for (const rs of cluster.list('ReplicaSet')) {
        const pods = ownedPods(cluster, rs).filter((p) => !p.metadata.deletionTimestamp)
        const diff = rs.spec.replicas - pods.length
        for (let i = 0; i < diff; i++) {
          const pod = createPod(sim, cluster, rs)
          cluster.recordEvent(
            ref(rs),
            'Normal',
            'SuccessfulCreate',
            `Created pod: ${pod.metadata.name}`,
            { component: 'replicaset-controller' },
          )
        }
        for (const pod of deletionOrder(pods).slice(0, Math.max(0, -diff))) {
          pod.metadata.deletionTimestamp = sim.clock.iso()
          cluster.put(pod)
          cluster.recordEvent(
            ref(rs),
            'Normal',
            'SuccessfulDelete',
            `Deleted pod: ${pod.metadata.name}`,
            { component: 'replicaset-controller' },
          )
        }
        refreshReplicaSetStatus(cluster, rs)
      }
    }
  },
}
