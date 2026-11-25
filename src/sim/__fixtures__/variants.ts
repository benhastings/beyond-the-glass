import { loadSimulation } from '../controllers/index.ts'
import { scenarioSchema, type ScenarioInput } from '../core/scenario.ts'
import type { Simulator } from '../core/simulator.ts'
import { miniScenarioInput } from '../core/testing.ts'

/**
 * The simulator's version of each fault variant captured from kind (tools/fixtures/variants.mjs): the mini
 * cluster's `web` Deployment, rolled out at +1s into the same fault, then left for the capture's wait.
 */
type Timeline = NonNullable<ScenarioInput['timeline']>
const at = (type: string, rest: Record<string, unknown>) => ({
  at: '+1s',
  type,
  namespace: 'shop',
  deployment: 'web',
  container: 'web',
  ...rest,
})
const image = (img: string, behaviour?: Record<string, unknown>) =>
  at('setImage', { image: img, ...(behaviour ? { behaviour } : {}) })

export const SIM_VARIANTS: Record<
  string,
  { timeline: Timeline; images?: ScenarioInput['images'] }
> = {
  healthy: { timeline: [image('registry.example/web:1.1')] },
  'bad-image': {
    timeline: [image('registry.example/ravenpost/web:missing', { pull: 'notFound' })],
  },
  crash: { timeline: [image('registry.example/web:crash', { exitAfterMs: 1000, exitCode: 1 })] },
  oom: {
    timeline: [
      image('registry.example/web:hungry', { memoryMi: 200 }),
      at('setResources', {
        image: undefined,
        limits: { memory: '48Mi' },
        requests: { memory: '32Mi' },
      }),
    ],
  },
  'missing-config-key': {
    timeline: [
      {
        at: '+1s',
        type: 'deleteConfigKey',
        namespace: 'shop',
        configMap: 'web-config',
        key: 'MODE',
      },
      image('registry.example/web:1.1'),
    ],
  },
  'bad-readiness': {
    timeline: [at('setReadinessPath', { path: '/ready' })],
    images: { 'registry.example/web:1.0': { healthPaths: ['/healthz'] } },
  },
  'oversized-requests': {
    timeline: [at('setResources', { requests: { cpu: '64', memory: '512Gi' } })],
  },
}

/** Loads a variant and lets it run as long as the real capture waited. */
export function simVariant(name: string, waitMs: number): Simulator {
  const v = SIM_VARIANTS[name]
  if (!v) throw new Error(`no sim variant ${name}`)
  const base = miniScenarioInput()
  const c0 = structuredClone(base.clusters[0]) as NonNullable<ScenarioInput['clusters']>[number]
  for (const r of c0.resources ?? [])
    if (r.kind === 'Deployment') {
      const c = r.spec.template.spec.containers[0]
      if (c) {
        c.env = [
          { name: 'MODE', valueFrom: { configMapKeyRef: { name: 'web-config', key: 'MODE' } } },
        ]
        c.readinessProbe = {
          httpGet: { path: '/healthz', port: 8080 },
          periodSeconds: 5,
          failureThreshold: 1,
        }
      }
      r.spec.replicas = 1
    }
  const timeline = v.timeline.map((e) =>
    Object.fromEntries(Object.entries(e).filter(([, x]) => x !== undefined)),
  ) as Timeline
  const sim = loadSimulation(
    scenarioSchema.parse({ ...base, clusters: [c0], timeline, images: v.images ?? {} }),
  )
  sim.advance(waitMs)
  return sim
}
