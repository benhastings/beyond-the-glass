import { z } from 'zod'
import { defineTimelineEvent, requireContainer } from './define.ts'

/** A new image is rolled out to a Deployment's container (what `kubectl set image` or an Argo sync does). */
export const setImage = defineTimelineEvent({
  type: 'setImage',
  description: "Changes a Deployment container's image",
  schema: z.strictObject({
    namespace: z.string().default('default'),
    deployment: z.string(),
    container: z.string(),
    image: z.string().min(1),
  }),
  check: (p, resources) => requireContainer(resources, p.namespace, p.deployment, p.container),
  apply: (_sim, cluster, p) => {
    const d = cluster.get('Deployment', p.namespace, p.deployment)
    const c = d?.spec.template.spec.containers.find((x) => x.name === p.container)
    if (!d || !c) return
    c.image = p.image
    d.metadata.generation = (d.metadata.generation ?? 1) + 1
    cluster.put(d)
  },
})
