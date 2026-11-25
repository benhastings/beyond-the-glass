import { age } from '../pod-columns.ts'
import type { Deployment, ReplicaSet } from '../../core/resources.ts'
import { definePrinter, selectorText } from './types.ts'

const containers = (t: { spec: { containers: { name: string; image: string }[] } }) => [
  t.spec.containers.map((c) => c.name).join(','),
  t.spec.containers.map((c) => c.image).join(','),
]

export const deploymentPrinter = definePrinter<Deployment>({
  type: 'deployments',
  nameGroup: 'deployment.apps',
  namespaced: true,
  list: (ctx, ns, selector) =>
    ctx.cluster.list('Deployment', {
      ...(ns ? { namespace: ns } : {}),
      ...(selector ? { selector } : {}),
    }),
  columns: ['NAME', 'READY', 'UP-TO-DATE', 'AVAILABLE', 'AGE'],
  row: (d, ctx) => [
    d.metadata.name,
    `${String(d.status.readyReplicas ?? 0)}/${String(d.spec.replicas)}`,
    String(d.status.updatedReplicas ?? 0),
    String(d.status.availableReplicas ?? 0),
    age(d.metadata.creationTimestamp, ctx.clock),
  ],
  wideColumns: ['CONTAINERS', 'IMAGES', 'SELECTOR'],
  wideRow: (d) => [...containers(d.spec.template), selectorText(d.spec.selector)],
})

export const replicaSetPrinter = definePrinter<ReplicaSet>({
  type: 'replicasets',
  nameGroup: 'replicaset.apps',
  namespaced: true,
  list: (ctx, ns, selector) =>
    ctx.cluster.list('ReplicaSet', {
      ...(ns ? { namespace: ns } : {}),
      ...(selector ? { selector } : {}),
    }),
  columns: ['NAME', 'DESIRED', 'CURRENT', 'READY', 'AGE'],
  row: (rs, ctx) => [
    rs.metadata.name,
    String(rs.spec.replicas),
    String(rs.status.replicas),
    String(rs.status.readyReplicas ?? 0),
    age(rs.metadata.creationTimestamp, ctx.clock),
  ],
  wideColumns: ['CONTAINERS', 'IMAGES', 'SELECTOR'],
  wideRow: (rs) => [...containers(rs.spec.template), selectorText(rs.spec.selector)],
})
