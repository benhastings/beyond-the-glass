import { z } from 'zod'
import { defineTimelineEvent, requireContainer } from './define.ts'

/** A Deployment container's memory limit changes (the usual setup for an OOMKilled lesson). */
export const setMemoryLimit = defineTimelineEvent({
  type: 'setMemoryLimit',
  description: "Changes a Deployment container's memory limit",
  schema: z.strictObject({
    namespace: z.string().default('default'),
    deployment: z.string(),
    container: z.string(),
    limit: z.string().regex(/^\d+(Ki|Mi|Gi|k|M|G)?$/, 'must be a memory quantity like 128Mi'),
  }),
  check: (p, resources) => requireContainer(resources, p.namespace, p.deployment, p.container),
  apply: (_sim, cluster, p) => {
    const d = cluster.get('Deployment', p.namespace, p.deployment)
    const c = d?.spec.template.spec.containers.find((x) => x.name === p.container)
    if (!d || !c) return
    c.resources = { ...c.resources, limits: { ...c.resources?.limits, memory: p.limit } }
    d.metadata.generation = (d.metadata.generation ?? 1) + 1
    cluster.put(d)
  },
})
