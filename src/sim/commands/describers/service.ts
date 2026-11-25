import type { Service } from '../../core/resources.ts'
import { goTabwriter } from '../format.ts'
import { endpointsText } from '../printers/network.ts'
import { selectorText } from '../printers/types.ts'
import { eventsSection, Lines, type DescribeContext } from './common.ts'

/** `kubectl describe service`. */
export function describeService(s: Service, ctx: DescribeContext): string {
  const l = new Lines()
  const ns = s.metadata.namespace ?? 'default'
  l.kv('Name', s.metadata.name).kv('Namespace', ns)
  l.map('Labels', s.metadata.labels)
  l.map('Annotations', s.metadata.annotations, 0, ': ')
  l.kv('Selector', selectorText(s.spec.selector))
  l.kv('Type', s.spec.type).kv('IP Family Policy', 'SingleStack').kv('IP Families', 'IPv4')
  l.kv('IP', s.spec.clusterIP).kv('IPs', (s.spec.clusterIPs ?? [s.spec.clusterIP]).join(','))
  const ep = ctx.cluster.endpointsFor(s)
  for (const p of s.spec.ports) {
    l.kv('Port', `${p.name ?? '<unset>'}\t${String(p.port)}/${p.protocol}`)
    l.kv('TargetPort', `${String(p.targetPort)}/${p.protocol}`)
    if (p.nodePort) l.kv('NodePort', `${p.name ?? '<unset>'}\t${String(p.nodePort)}/${p.protocol}`)
    l.kv('Endpoints', endpointsText(ep))
  }
  l.kv('Session Affinity', s.spec.sessionAffinity ?? 'None')
  l.kv('Internal Traffic Policy', 'Cluster')
  eventsSection(l, ctx, { kind: 'Service', name: s.metadata.name, namespace: ns })
  return goTabwriter(l.out)
}
