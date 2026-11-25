import type { Deployment } from '../../core/resources.ts'
import { ownedReplicaSets } from '../../core/workloads.ts'
import { goTabwriter, rfc1123z } from '../format.ts'
import { selectorText } from '../printers/types.ts'
import { containerSpec, eventsSection, Lines, type DescribeContext } from './common.ts'

const REVISION = 'deployment.kubernetes.io/revision'

/** `kubectl describe deployment`. */
export function describeDeployment(d: Deployment, ctx: DescribeContext): string {
  const l = new Lines()
  const ns = d.metadata.namespace ?? 'default'
  const st = d.status
  const ru = d.spec.strategy.rollingUpdate
  l.kv('Name', d.metadata.name)
    .kv('Namespace', ns)
    .kv('CreationTimestamp', rfc1123z(d.metadata.creationTimestamp))
  l.map('Labels', d.metadata.labels)
  l.map('Annotations', d.metadata.annotations, 0, ': ')
  l.kv('Selector', selectorText(d.spec.selector))
  l.kv(
    'Replicas',
    `${String(d.spec.replicas)} desired | ${String(st.updatedReplicas ?? 0)} updated | ${String(st.replicas ?? 0)} total | ${String(st.availableReplicas ?? 0)} available | ${String(st.unavailableReplicas ?? 0)} unavailable`,
  )
  l.kv('StrategyType', d.spec.strategy.type)
  l.kv('MinReadySeconds', String(d.spec.minReadySeconds ?? 0))
  if (d.spec.strategy.type === 'RollingUpdate')
    l.kv(
      'RollingUpdateStrategy',
      `${String(ru?.maxUnavailable ?? '25%')} max unavailable, ${String(ru?.maxSurge ?? '25%')} max surge`,
    )
  l.head('Pod Template')
  l.map('Labels', d.spec.template.metadata.labels, 1)
  l.head('Containers', 1)
  for (const c of d.spec.template.spec.containers) {
    l.raw(`   ${c.name}:`)
    l.raw(`    Image:\t${c.image}`)
    const spec = new Lines()
    containerSpec(spec, c, 2, undefined)
    for (const line of spec.out) l.raw(line)
  }
  l.kv('Volumes', '<none>', 1).kv('Node-Selectors', '<none>', 1).kv('Tolerations', '<none>', 1)
  l.head('Conditions')
  l.raw('  Type\tStatus\tReason')
  l.raw('  ----\t------\t------')
  for (const c of st.conditions ?? []) l.raw(`  ${c.type}\t${c.status}\t${c.reason ?? ''}`)
  const sets = ownedReplicaSets(ctx.cluster, d)
  const current = sets.find(
    (rs) => rs.metadata.annotations?.[REVISION] === d.metadata.annotations?.[REVISION],
  )
  const old = sets.filter((rs) => rs !== current && rs.spec.replicas > 0)
  const rsText = (rs: (typeof sets)[number]) =>
    `${rs.metadata.name} (${String(rs.status.replicas)}/${String(rs.spec.replicas)} replicas created)`
  l.kv('OldReplicaSets', old.length ? old.map(rsText).join(', ') : '<none>')
  l.kv('NewReplicaSet', current ? rsText(current) : '<none>')
  eventsSection(l, ctx, {
    kind: 'Deployment',
    name: d.metadata.name,
    uid: d.metadata.uid,
    namespace: ns,
  })
  return goTabwriter(l.out)
}
