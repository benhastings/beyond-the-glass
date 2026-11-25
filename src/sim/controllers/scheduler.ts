import type { Cluster } from '../core/cluster.ts'
import type { Node, Pod } from '../core/resources.ts'
import type { Controller, Simulator } from '../core/simulator.ts'
import { condition } from '../core/pods.ts'
import { cpuMillis, memoryBytes } from './quantity.ts'

/** Sum of the containers' requests (a missing request counts as 0, as in the real scheduler). */
export function podRequests(pod: Pod): { cpu: number; memory: number } {
  return pod.spec.containers.reduce(
    (t, c) => ({
      cpu: t.cpu + cpuMillis(c.resources?.requests?.cpu),
      memory: t.memory + memoryBytes(c.resources?.requests?.memory),
    }),
    { cpu: 0, memory: 0 },
  )
}

const active = (p: Pod) => p.status.phase !== 'Succeeded' && p.status.phase !== 'Failed'

/** What's left on a node after the requests of the pods already bound to it. */
export function nodeFree(
  cluster: Cluster,
  node: Node,
): { cpu: number; memory: number; pods: number } {
  const bound = cluster
    .list('Pod')
    .filter((p) => p.spec.nodeName === node.metadata.name && active(p))
  const used = bound
    .map(podRequests)
    .reduce((a, b) => ({ cpu: a.cpu + b.cpu, memory: a.memory + b.memory }), { cpu: 0, memory: 0 })
  return {
    cpu: cpuMillis(node.status.allocatable.cpu) - used.cpu,
    memory: memoryBytes(node.status.allocatable.memory) - used.memory,
    pods: Number(node.status.allocatable.pods ?? 110) - bound.length,
  }
}

/** Taints the pod doesn't tolerate (the simulated pods tolerate none). */
const untolerated = (n: Node) =>
  (n.spec.taints ?? []).filter((t) => t.effect === 'NoSchedule' || t.effect === 'NoExecute')

/**
 * Where a pod can go: the node with the most free CPU among those that fit, or the reasons none does,
 * phrased like kube-scheduler ("0/3 nodes are available: 1 node(s) had untolerated taint …, 2 Insufficient memory.").
 */
export function placePod(cluster: Cluster, pod: Pod): { node: string } | { message: string } {
  const nodes = cluster.list('Node')
  const want = podRequests(pod)
  const reasons = new Map<string, number>()
  const add = (r: string) => reasons.set(r, (reasons.get(r) ?? 0) + 1)
  const fits: { name: string; cpu: number }[] = []
  let blocked = 0
  let short = 0
  for (const n of nodes) {
    const taints = untolerated(n)
    if (n.spec.unschedulable) {
      add('node(s) were unschedulable')
      blocked++
      continue
    }
    if (taints.length) {
      const t = taints[0]
      add(`node(s) had untolerated taint {${t?.key ?? ''}: ${t?.value ?? ''}}`)
      blocked++
      continue
    }
    if (n.status.conditions.some((c) => c.type === 'Ready' && c.status !== 'True')) {
      add('node(s) had untolerated taint {node.kubernetes.io/not-ready: }')
      blocked++
      continue
    }
    const free = nodeFree(cluster, n)
    const lacking: string[] = []
    if (free.pods < 1) lacking.push('Too many pods')
    if (want.cpu > free.cpu) lacking.push('Insufficient cpu')
    if (want.memory > free.memory) lacking.push('Insufficient memory')
    if (lacking.length) {
      for (const r of lacking) add(r)
      short++
    } else fits.push({ name: n.metadata.name, cpu: free.cpu })
  }
  if (fits.length) {
    fits.sort((a, b) => b.cpu - a.cpu || (a.name < b.name ? -1 : 1))
    return { node: fits[0]?.name ?? '' }
  }
  const parts = [...reasons.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([r, n]) => `${String(n)} ${r}`)
  const total = String(nodes.length)
  // Preemption can't help on a node the pod can't use at all; on a full node there's nothing to evict
  // (the simulated pods all share one priority).
  const preemption = [
    ...(blocked ? [`${String(blocked)} Preemption is not helpful for scheduling`] : []),
    ...(short ? [`${String(short)} No preemption victims found for incoming pod`] : []),
  ]
  return {
    message: `0/${total} nodes are available: ${parts.join(', ')}. preemption: 0/${total} nodes are available: ${preemption.join(', ')}.`,
  }
}

/** Binds pending pods to nodes. Unschedulable pods are retried whenever anything changes. */
export const scheduler: Controller = {
  name: 'scheduler',
  reconcile: (sim: Simulator) => {
    for (const name of sim.clusterNames) {
      const cluster = sim.clusterByName(name)
      if (!cluster) continue
      for (const pod of cluster.list('Pod')) {
        if (pod.spec.nodeName || pod.metadata.deletionTimestamp || !active(pod)) continue
        const now = sim.clock.iso()
        const ref = {
          kind: 'Pod',
          name: pod.metadata.name,
          namespace: pod.metadata.namespace ?? 'default',
          uid: pod.metadata.uid,
          apiVersion: 'v1',
        }
        const place = placePod(cluster, pod)
        const others = (pod.status.conditions ?? []).filter((c) => c.type !== 'PodScheduled')
        if ('node' in place) {
          pod.spec.nodeName = place.node
          pod.status.conditions = [
            ...others,
            condition('PodScheduled', true, now, { lastProbeTime: null }),
          ]
          cluster.put(pod)
          cluster.recordEvent(
            ref,
            'Normal',
            'Scheduled',
            `Successfully assigned ${ref.namespace}/${ref.name} to ${place.node}`,
            { component: 'default-scheduler' },
          )
          continue
        }
        const previous = pod.status.conditions?.find((c) => c.type === 'PodScheduled')
        if (previous?.message === place.message) continue
        pod.status.conditions = [
          ...others,
          condition('PodScheduled', false, now, {
            lastProbeTime: null,
            reason: 'Unschedulable',
            message: place.message,
          }),
        ]
        cluster.put(pod)
        cluster.recordEvent(ref, 'Warning', 'FailedScheduling', place.message, {
          component: 'default-scheduler',
        })
      }
    }
  },
}
