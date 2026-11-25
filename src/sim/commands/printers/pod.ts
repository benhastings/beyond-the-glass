import { age, podColumns } from '../pod-columns.ts'
import type { Pod } from '../../core/resources.ts'
import { definePrinter } from './types.ts'

export const podPrinter = definePrinter<Pod>({
  type: 'pods',
  nameGroup: 'pod',
  namespaced: true,
  list: (ctx, ns, selector) =>
    ctx.cluster.list('Pod', {
      ...(ns ? { namespace: ns } : {}),
      ...(selector ? { selector } : {}),
    }),
  columns: ['NAME', 'READY', 'STATUS', 'RESTARTS', 'AGE'],
  row: (p, ctx) => {
    const c = podColumns(p, ctx.clock)
    return [
      p.metadata.name,
      c.ready,
      c.status,
      c.restarts,
      age(p.metadata.creationTimestamp, ctx.clock),
    ]
  },
  wideColumns: ['IP', 'NODE', 'NOMINATED NODE', 'READINESS GATES'],
  wideRow: (p) => [p.status.podIP ?? '<none>', p.spec.nodeName ?? '<none>', '<none>', '<none>'],
})
