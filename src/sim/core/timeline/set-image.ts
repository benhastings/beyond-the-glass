import { z } from 'zod'
import { behaviourSchema, setImageBehaviour } from '../behaviour.ts'
import { defineTimelineEvent, requireContainer } from './define.ts'

/**
 * A new image is rolled out to a Deployment's container (what `kubectl set image` or an Argo sync does).
 * `behaviour` says how the new image behaves: the usual way to introduce a fault with a deploy (E6-03).
 */
export const setImage = defineTimelineEvent({
  type: 'setImage',
  description: "Changes a Deployment container's image",
  schema: z.strictObject({
    namespace: z.string().default('default'),
    deployment: z.string(),
    container: z.string(),
    image: z.string().min(1),
    behaviour: behaviourSchema.optional(),
  }),
  check: (p, resources) => requireContainer(resources, p.namespace, p.deployment, p.container),
  apply: (sim, cluster, p) => {
    if (p.behaviour) setImageBehaviour(sim, p.image, p.behaviour)
    const d = cluster.get('Deployment', p.namespace, p.deployment)
    const c = d?.spec.template.spec.containers.find((x) => x.name === p.container)
    if (!d || !c) return
    c.image = p.image
    d.metadata.generation = (d.metadata.generation ?? 1) + 1
    cluster.put(d)
  },
})
