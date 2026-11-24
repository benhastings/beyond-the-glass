import { z } from 'zod'
import { defineTimelineEvent, requireResource } from './define.ts'

/** A key disappears from a ConfigMap (pods that reference it will fail with CreateContainerConfigError, E6-03). */
export const deleteConfigKey = defineTimelineEvent({
  type: 'deleteConfigKey',
  description: 'Removes a key from a ConfigMap',
  schema: z.strictObject({
    namespace: z.string().default('default'),
    configMap: z.string(),
    key: z.string(),
  }),
  check: (p, resources) => {
    const missing = requireResource(resources, 'ConfigMap', p.namespace, p.configMap, ['configMap'])
    if (missing.length) return missing
    const cm = resources.find(
      (r) =>
        r.kind === 'ConfigMap' &&
        r.metadata.name === p.configMap &&
        (r.metadata.namespace ?? 'default') === p.namespace,
    )
    return cm?.kind === 'ConfigMap' && Object.hasOwn(cm.data, p.key)
      ? []
      : [{ path: ['key'], message: `ConfigMap ${p.configMap} has no key "${p.key}"` }]
  },
  apply: (_sim, cluster, p) => {
    const cm = cluster.get('ConfigMap', p.namespace, p.configMap)
    if (!cm) return
    cm.data = Object.fromEntries(Object.entries(cm.data).filter(([k]) => k !== p.key))
    cluster.put(cm)
  },
})
