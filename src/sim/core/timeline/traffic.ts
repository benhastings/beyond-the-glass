import { z } from 'zod'
import { defineTimelineEvent, requireResource } from './define.ts'

const target = {
  namespace: z.string().default('default'),
  service: z.string(),
}

/** Extra latency on a Service's requests, picked up by the telemetry generator (E8-01). */
export const injectLatency = defineTimelineEvent({
  type: 'injectLatency',
  description: "Adds latency to a Service's requests",
  schema: z.strictObject({ ...target, ms: z.number().nonnegative() }),
  check: (p, resources) =>
    requireResource(resources, 'Service', p.namespace, p.service, ['service']),
  apply: (sim, cluster, p) => {
    sim.setTraffic(cluster.name, p.namespace, p.service, { latencyMs: p.ms })
  },
})

/** A Service's request rate changes, picked up by the telemetry generator (E8-01). */
export const load = defineTimelineEvent({
  type: 'load',
  description: "Sets a Service's request rate",
  schema: z.strictObject({ ...target, rps: z.number().nonnegative() }),
  check: (p, resources) =>
    requireResource(resources, 'Service', p.namespace, p.service, ['service']),
  apply: (sim, cluster, p) => {
    sim.setTraffic(cluster.name, p.namespace, p.service, { rps: p.rps })
  },
})
