import { z } from 'zod'
import { defineTimelineEvent } from './define.ts'

/**
 * A Warning event on a node (E10-02), such as disk pressure on a node the incident doesn't touch: a red
 * herring for `kubectl get events` and `kubectl describe node`.
 */
export const nodeWarning = defineTimelineEvent({
  type: 'nodeWarning',
  description: 'Records a Warning event on a node',
  schema: z.strictObject({
    node: z.string(),
    reason: z.string().default('NodeHasDiskPressure'),
    message: z.string().optional(),
    component: z.string().default('kubelet'),
  }),
  apply: (_sim, cluster, p) => {
    const node = cluster.get('Node', undefined, p.node)
    if (!node) return
    cluster.recordEvent(
      { kind: 'Node', name: p.node, uid: node.metadata.uid, namespace: 'default' },
      'Warning',
      p.reason,
      p.message ?? `Node ${p.node} status is now: ${p.reason}`,
      { component: p.component, host: p.node },
    )
  },
})
