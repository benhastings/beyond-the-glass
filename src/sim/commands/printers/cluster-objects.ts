import { age } from '../pod-columns.ts'
import type { ConfigMap, Event, Namespace, Node, Secret } from '../../core/resources.ts'
import { definePrinter } from './types.ts'

export const nodePrinter = definePrinter<Node>({
  type: 'nodes',
  nameGroup: 'node',
  namespaced: false,
  list: (ctx, _ns, selector) => ctx.cluster.list('Node', selector ? { selector } : {}),
  columns: ['NAME', 'STATUS', 'ROLES', 'AGE', 'VERSION'],
  row: (n, ctx) => {
    const ready = n.status.conditions.find((c) => c.type === 'Ready')?.status === 'True'
    const roles = Object.keys(n.metadata.labels ?? {})
      .filter((k) => k.startsWith('node-role.kubernetes.io/'))
      .map((k) => k.slice('node-role.kubernetes.io/'.length))
    return [
      n.metadata.name,
      `${ready ? 'Ready' : 'NotReady'}${n.spec.unschedulable ? ',SchedulingDisabled' : ''}`,
      roles.join(',') || '<none>',
      age(n.metadata.creationTimestamp, ctx.clock),
      n.status.nodeInfo.kubeletVersion,
    ]
  },
  wideColumns: ['INTERNAL-IP', 'EXTERNAL-IP', 'OS-IMAGE', 'KERNEL-VERSION', 'CONTAINER-RUNTIME'],
  wideRow: (n) => [
    n.status.addresses.find((a) => a.type === 'InternalIP')?.address ?? '<none>',
    '<none>',
    n.status.nodeInfo.osImage,
    n.status.nodeInfo.kernelVersion,
    n.status.nodeInfo.containerRuntimeVersion,
  ],
})

export const namespacePrinter = definePrinter<Namespace>({
  type: 'namespaces',
  nameGroup: 'namespace',
  namespaced: false,
  list: (ctx, _ns, selector) => ctx.cluster.list('Namespace', selector ? { selector } : {}),
  columns: ['NAME', 'STATUS', 'AGE'],
  row: (n, ctx) => [n.metadata.name, n.status.phase, age(n.metadata.creationTimestamp, ctx.clock)],
})

export const configMapPrinter = definePrinter<ConfigMap>({
  type: 'configmaps',
  nameGroup: 'configmap',
  namespaced: true,
  list: (ctx, ns, selector) =>
    ctx.cluster.list('ConfigMap', {
      ...(ns ? { namespace: ns } : {}),
      ...(selector ? { selector } : {}),
    }),
  columns: ['NAME', 'DATA', 'AGE'],
  row: (c, ctx) => [
    c.metadata.name,
    String(Object.keys(c.data).length),
    age(c.metadata.creationTimestamp, ctx.clock),
  ],
})

export const secretPrinter = definePrinter<Secret>({
  type: 'secrets',
  nameGroup: 'secret',
  namespaced: true,
  list: (ctx, ns, selector) =>
    ctx.cluster.list('Secret', {
      ...(ns ? { namespace: ns } : {}),
      ...(selector ? { selector } : {}),
    }),
  columns: ['NAME', 'TYPE', 'DATA', 'AGE'],
  row: (s, ctx) => [
    s.metadata.name,
    s.type,
    String(Object.keys(s.data).length),
    age(s.metadata.creationTimestamp, ctx.clock),
  ],
  // Values are never kept (scenarios.md); the API view says so instead of showing base64.
  toApi: (s) => ({
    ...s,
    data: Object.fromEntries(
      Object.entries(s.data).map(([k, v]) => [k, `<redacted: ${String(v.bytes)} bytes>`]),
    ),
  }),
})

export const eventPrinter = definePrinter<Event>({
  type: 'events',
  nameGroup: 'event',
  namespaced: true,
  list: (ctx, ns, selector) =>
    ctx.cluster.list('Event', {
      ...(ns ? { namespace: ns } : {}),
      ...(selector ? { selector } : {}),
    }),
  columns: ['LAST SEEN', 'TYPE', 'REASON', 'OBJECT', 'MESSAGE'],
  row: (e, ctx) => [
    age(e.lastTimestamp, ctx.clock),
    e.type,
    e.reason,
    `${e.involvedObject.kind.toLowerCase()}/${e.involvedObject.name}`,
    e.message,
  ],
})
