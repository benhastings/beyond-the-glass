import { SAFE_ALPHABET, digestOf } from '../../core/names.ts'
import type { ContainerState, Pod } from '../../core/resources.ts'
import { goTabwriter, rfc1123z } from '../format.ts'
import { containerSpec, eventsSection, Lines, type DescribeContext } from './common.ts'

/** The projected service-account volume kubelet mounts in every pod: `kube-api-access-xxxxx`. */
export const apiAccessVolume = (uid: string) =>
  `kube-api-access-${Array.from({ length: 5 }, (_, i) => SAFE_ALPHABET.charAt(parseInt(digestOf(uid).charAt(i), 16) % SAFE_ALPHABET.length)).join('')}`

function state(lines: Lines, label: string, s: ContainerState) {
  if (s.running) {
    lines.kv(label, 'Running', 2).kv('Started', rfc1123z(s.running.startedAt), 3)
  } else if (s.waiting) {
    lines.kv(label, 'Waiting', 2)
    if (s.waiting.reason) lines.kv('Reason', s.waiting.reason, 3)
  } else if (s.terminated) {
    const t = s.terminated
    lines.kv(label, 'Terminated', 2)
    if (t.reason) lines.kv('Reason', t.reason, 3)
    if (t.message) lines.kv('Message', t.message, 3)
    lines.kv('Exit Code', String(t.exitCode), 3)
    if (t.signal) lines.kv('Signal', String(t.signal), 3)
    if (t.startedAt) lines.kv('Started', rfc1123z(t.startedAt), 3)
    if (t.finishedAt) lines.kv('Finished', rfc1123z(t.finishedAt), 3)
  } else lines.kv(label, 'Waiting', 2)
}

/** `kubectl describe pod`, in kubectl's section order and wording. */
export function describePod(p: Pod, ctx: DescribeContext): string {
  const l = new Lines()
  const ns = p.metadata.namespace ?? 'default'
  const volume = apiAccessVolume(p.metadata.uid)
  l.kv('Name', p.metadata.name)
    .kv('Namespace', ns)
    .kv('Priority', '0')
    .kv('Service Account', p.spec.serviceAccountName ?? 'default')
  l.kv('Node', p.spec.nodeName ? `${p.spec.nodeName}/${p.status.hostIP ?? ''}` : '<none>')
  l.kv('Start Time', p.status.startTime ? rfc1123z(p.status.startTime) : '<unknown>')
  l.map('Labels', p.metadata.labels)
  l.map('Annotations', p.metadata.annotations, 0, ': ')
  l.kv('Status', p.metadata.deletionTimestamp ? 'Terminating' : p.status.phase)
  if (p.status.reason) l.kv('Reason', p.status.reason)
  if (p.status.message) l.kv('Message', p.status.message)
  l.kv('IP', p.status.podIP ?? '')
  if (p.status.podIP) l.head('IPs').kv('IP', p.status.podIP, 1)
  else l.kv('IPs', '<none>')
  const owner = p.metadata.ownerReferences?.find((o) => o.controller)
  if (owner) l.kv('Controlled By', `${owner.kind}/${owner.name}`)
  l.head('Containers')
  for (const c of p.spec.containers) {
    const cs = p.status.containerStatuses?.find((s) => s.name === c.name)
    l.head(c.name, 1)
    if (cs?.containerID) l.kv('Container ID', cs.containerID, 2)
    l.kv('Image', c.image, 2)
    l.kv('Image ID', cs?.imageID ?? '', 2)
    // State and Last State come right after the ports in kubectl's layout; reuse the shared spec lines.
    const specLines = new Lines()
    containerSpec(specLines, c, 2, volume)
    const [port, hostPort, ...rest] = specLines.out
    if (port) l.raw(port)
    if (hostPort) l.raw(hostPort)
    state(l, 'State', cs?.state ?? { waiting: { reason: 'ContainerCreating' } })
    if (cs?.lastState.terminated) state(l, 'Last State', cs.lastState)
    l.kv('Ready', cs?.ready ? 'True' : 'False', 2)
    l.kv('Restart Count', String(cs?.restartCount ?? 0), 2)
    for (const line of rest) l.raw(line)
  }
  l.head('Conditions')
  l.raw('  Type\tStatus')
  for (const c of p.status.conditions ?? []) l.raw(`  ${c.type} \t${c.status} `)
  l.head('Volumes')
  l.head(volume, 1)
  l.kv('Type', 'Projected (a volume that contains injected data from multiple sources)', 2)
  l.kv('TokenExpirationSeconds', '3607', 2)
    .kv('ConfigMapName', 'kube-root-ca.crt', 2)
    .kv('Optional', 'false', 2)
    .kv('DownwardAPI', 'true', 2)
  l.kv('QoS Class', p.status.qosClass ?? 'BestEffort')
  l.map('Node-Selectors', p.spec.nodeSelector)
  l.raw('Tolerations:\tnode.kubernetes.io/not-ready:NoExecute op=Exists for 300s')
  l.raw('\tnode.kubernetes.io/unreachable:NoExecute op=Exists for 300s')
  eventsSection(l, ctx, { kind: 'Pod', name: p.metadata.name, uid: p.metadata.uid, namespace: ns })
  return goTabwriter(l.out)
}
