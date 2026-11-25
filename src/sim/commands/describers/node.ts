import type { Node } from '../../core/resources.ts'
import { cpuMillis, memoryBytes } from '../../controllers/quantity.ts'
import { humanDuration } from '../format.ts'
import { goTabwriter, rfc1123z } from '../format.ts'
import { eventsSection, Lines, type DescribeContext } from './common.ts'

const pct = (used: number, total: number) =>
  total > 0 ? `${String(Math.floor((used * 100) / total))}%` : '0%'
const cpuText = (m: number) => (m % 1000 === 0 ? String(m / 1000) : `${String(m)}m`)
const memText = (b: number) =>
  b === 0
    ? '0'
    : b % 1024 ** 3 === 0
      ? `${String(b / 1024 ** 3)}Gi`
      : `${String(Math.round(b / 1024 ** 2))}Mi`

/** `kubectl describe node`: identity, conditions, capacity, the pods on it and what they request. */
export function describeNode(n: Node, ctx: DescribeContext): string {
  const l = new Lines()
  const roles = Object.keys(n.metadata.labels ?? {})
    .filter((k) => k.startsWith('node-role.kubernetes.io/'))
    .map((k) => k.slice('node-role.kubernetes.io/'.length))
  l.kv('Name', n.metadata.name).kv('Roles', roles.join(',') || '<none>')
  l.map('Labels', n.metadata.labels)
  l.map('Annotations', n.metadata.annotations, 0, ': ')
  l.kv('CreationTimestamp', rfc1123z(n.metadata.creationTimestamp))
  const taints = (n.spec.taints ?? []).map(
    (t) => `${t.key}${t.value ? `=${t.value}` : ''}:${t.effect}`,
  )
  l.kv('Taints', taints.join(', ') || '<none>')
  l.kv('Unschedulable', String(n.spec.unschedulable ?? false))
  l.head('Conditions')
  l.raw('  Type\tStatus\tLastHeartbeatTime\tLastTransitionTime\tReason\tMessage')
  l.raw('  ----\t------\t-----------------\t------------------\t------\t-------')
  for (const c of n.status.conditions)
    l.raw(
      `  ${c.type}\t${c.status}\t${rfc1123z(c.lastHeartbeatTime ?? n.metadata.creationTimestamp)}\t${rfc1123z(c.lastTransitionTime ?? n.metadata.creationTimestamp)}\t${c.reason ?? ''}\t${c.message ?? ''}`,
    )
  l.head('Addresses')
  for (const a of n.status.addresses) l.kv(a.type, a.address, 1)
  for (const [label, list] of [
    ['Capacity', n.status.capacity],
    ['Allocatable', n.status.allocatable],
  ] as const) {
    l.head(label)
    for (const [k, v] of Object.entries(list).sort(([a], [b]) => (a < b ? -1 : 1))) l.kv(k, v, 1)
  }
  l.head('System Info')
  const i = n.status.nodeInfo
  l.kv('Kernel Version', i.kernelVersion, 1)
    .kv('OS Image', i.osImage, 1)
    .kv('Operating System', i.operatingSystem, 1)
    .kv('Architecture', i.architecture, 1)
  l.kv('Container Runtime Version', i.containerRuntimeVersion, 1).kv(
    'Kubelet Version',
    i.kubeletVersion,
    1,
  )
  l.kv('PodCIDR', n.spec.podCIDR ?? '').kv('PodCIDRs', n.spec.podCIDR ?? '')
  const pods = ctx.cluster
    .list('Pod')
    .filter(
      (p) =>
        p.spec.nodeName === n.metadata.name &&
        p.status.phase !== 'Succeeded' &&
        p.status.phase !== 'Failed',
    )
  const sum =
    (f: (r: { cpu?: string; memory?: string } | undefined) => number, k: 'requests' | 'limits') =>
    (p: (typeof pods)[number]) =>
      p.spec.containers.reduce((t, c) => t + f(c.resources?.[k]), 0)
  const cpuReq = sum((r) => cpuMillis(r?.cpu), 'requests')
  const cpuLim = sum((r) => cpuMillis(r?.cpu), 'limits')
  const memReq = sum((r) => memoryBytes(r?.memory), 'requests')
  const memLim = sum((r) => memoryBytes(r?.memory), 'limits')
  const capCpu = cpuMillis(n.status.allocatable.cpu)
  const capMem = memoryBytes(n.status.allocatable.memory)
  l.kv('Non-terminated Pods', `(${String(pods.length)} in total)`)
  l.raw('  Namespace\tName\tCPU Requests\tCPU Limits\tMemory Requests\tMemory Limits\tAge')
  l.raw('  ---------\t----\t------------\t----------\t---------------\t-------------\t---')
  for (const p of pods) {
    const ago = humanDuration(
      ctx.clock.now - (Date.parse(p.metadata.creationTimestamp) - ctx.clock.epochMs),
    )
    l.raw(
      `  ${p.metadata.namespace ?? 'default'}\t${p.metadata.name}\t${cpuText(cpuReq(p))} (${pct(cpuReq(p), capCpu)})\t${cpuText(cpuLim(p))} (${pct(cpuLim(p), capCpu)})\t${memText(memReq(p))} (${pct(memReq(p), capMem)})\t${memText(memLim(p))} (${pct(memLim(p), capMem)})\t${ago}`,
    )
  }
  const total = (f: (p: (typeof pods)[number]) => number) => pods.reduce((t, p) => t + f(p), 0)
  l.head('Allocated resources')
  l.raw('  (Total limits may be over 100 percent, i.e., overcommitted.)')
  l.raw('  Resource\tRequests\tLimits')
  l.raw('  --------\t--------\t------')
  l.raw(
    `  cpu\t${cpuText(total(cpuReq))} (${pct(total(cpuReq), capCpu)})\t${cpuText(total(cpuLim))} (${pct(total(cpuLim), capCpu)})`,
  )
  l.raw(
    `  memory\t${memText(total(memReq))} (${pct(total(memReq), capMem)})\t${memText(total(memLim))} (${pct(total(memLim), capMem)})`,
  )
  l.raw('  ephemeral-storage\t0 (0%)\t0 (0%)')
  eventsSection(l, ctx, { kind: 'Node', name: n.metadata.name })
  return goTabwriter(l.out)
}
