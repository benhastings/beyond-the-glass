import { age } from '../pod-columns.ts'
import type { Endpoints, Service } from '../../core/resources.ts'
import { definePrinter, selectorText } from './types.ts'

const ports = (s: Service) =>
  s.spec.ports
    .map((p) => `${String(p.port)}${p.nodePort ? `:${String(p.nodePort)}` : ''}/${p.protocol}`)
    .join(',')

export const servicePrinter = definePrinter<Service>({
  type: 'services',
  nameGroup: 'service',
  namespaced: true,
  list: (ctx, ns, selector) =>
    ctx.cluster.list('Service', {
      ...(ns ? { namespace: ns } : {}),
      ...(selector ? { selector } : {}),
    }),
  columns: ['NAME', 'TYPE', 'CLUSTER-IP', 'EXTERNAL-IP', 'PORT(S)', 'AGE'],
  row: (s, ctx) => [
    s.metadata.name,
    s.spec.type,
    s.spec.clusterIP,
    s.spec.type === 'LoadBalancer' ? '<pending>' : '<none>',
    ports(s),
    age(s.metadata.creationTimestamp, ctx.clock),
  ],
  wideColumns: ['SELECTOR'],
  wideRow: (s) => [selectorText(s.spec.selector)],
})

/** `10.244.1.2:8080,10.244.2.3:8080`, at most three, then "+ N more...", like kubectl. */
export function endpointsText(ep: Endpoints): string {
  const all = ep.subsets.flatMap((s) =>
    (s.addresses ?? []).flatMap((a) => s.ports.map((p) => `${a.ip}:${String(p.port)}`)),
  )
  if (all.length === 0) return '<none>'
  return all.length > 3
    ? `${all.slice(0, 3).join(',')} + ${String(all.length - 3)} more...`
    : all.join(',')
}

export const endpointsPrinter = definePrinter<Endpoints>({
  type: 'endpoints',
  nameGroup: 'endpoints',
  namespaced: true,
  list: (ctx, ns, selector) =>
    ctx.cluster
      .list('Service', { ...(ns ? { namespace: ns } : {}), ...(selector ? { selector } : {}) })
      .map((s) => ctx.cluster.endpointsFor(s)),
  columns: ['NAME', 'ENDPOINTS', 'AGE'],
  row: (ep, ctx) => [
    ep.metadata.name,
    endpointsText(ep),
    age(ep.metadata.creationTimestamp, ctx.clock),
  ],
  warning: 'Warning: v1 Endpoints is deprecated in v1.33+; use discovery.k8s.io/v1 EndpointSlice',
})
