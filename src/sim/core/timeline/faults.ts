import { z } from 'zod'
import { defineTimelineEvent, requireContainer, requireResource } from './define.ts'

const quantity = z.union([z.string(), z.number()]).transform(String)
const resourceList = z.strictObject({ cpu: quantity.optional(), memory: quantity.optional() })

/**
 * A Deployment container's requests and limits change: too-large requests leave new pods Pending
 * (FailedScheduling); a memory limit below what the app uses gets them OOMKilled (E6-03).
 */
export const setResources = defineTimelineEvent({
  type: 'setResources',
  description: "Changes a Deployment container's resource requests and limits",
  schema: z.strictObject({
    namespace: z.string().default('default'),
    deployment: z.string(),
    container: z.string(),
    requests: resourceList.optional(),
    limits: resourceList.optional(),
  }),
  check: (p, resources) => requireContainer(resources, p.namespace, p.deployment, p.container),
  apply: (_sim, cluster, p) => {
    const d = cluster.get('Deployment', p.namespace, p.deployment)
    const c = d?.spec.template.spec.containers.find((x) => x.name === p.container)
    if (!d || !c) return
    c.resources = {
      ...(c.resources?.requests || p.requests
        ? { requests: { ...c.resources?.requests, ...p.requests } }
        : {}),
      ...(c.resources?.limits || p.limits
        ? { limits: { ...c.resources?.limits, ...p.limits } }
        : {}),
    }
    d.metadata.generation = (d.metadata.generation ?? 1) + 1
    cluster.put(d)
  },
})

/** A readiness probe pointed at a path the app doesn't serve: new pods never become Ready (E6-03). */
export const setReadinessPath = defineTimelineEvent({
  type: 'setReadinessPath',
  description: "Changes the HTTP path of a Deployment container's readiness probe",
  schema: z.strictObject({
    namespace: z.string().default('default'),
    deployment: z.string(),
    container: z.string(),
    path: z.string().startsWith('/'),
  }),
  check: (p, resources) => requireContainer(resources, p.namespace, p.deployment, p.container),
  apply: (_sim, cluster, p) => {
    const d = cluster.get('Deployment', p.namespace, p.deployment)
    const c = d?.spec.template.spec.containers.find((x) => x.name === p.container)
    if (!d || !c) return
    const port = c.readinessProbe?.httpGet?.port ?? c.ports?.[0]?.containerPort ?? 8080
    c.readinessProbe = {
      ...c.readinessProbe,
      httpGet: { ...c.readinessProbe?.httpGet, path: p.path, port },
    }
    d.metadata.generation = (d.metadata.generation ?? 1) + 1
    cluster.put(d)
  },
})

/** A Service's selector changes: if it matches no pods, the Service has no endpoints (E6-03). */
export const setServiceSelector = defineTimelineEvent({
  type: 'setServiceSelector',
  description: "Replaces a Service's selector",
  schema: z.strictObject({
    namespace: z.string().default('default'),
    service: z.string(),
    selector: z.record(z.string(), z.string()),
  }),
  check: (p, resources) =>
    requireResource(resources, 'Service', p.namespace, p.service, ['service']),
  apply: (_sim, cluster, p) => {
    const svc = cluster.get('Service', p.namespace, p.service)
    if (!svc) return
    svc.spec.selector = { ...p.selector }
    cluster.put(svc)
  },
})
