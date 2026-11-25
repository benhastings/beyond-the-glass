import { describe, expect } from 'vitest'
import { acTest } from '@/test/ac'
import { isPodReady } from '../core/cluster'
import type { Pod } from '../core/resources'
import { scenarioSchema, type ScenarioInput } from '../core/scenario'
import type { Simulator } from '../core/simulator'
import { miniScenarioInput } from '../core/testing'
import { createShell } from '../commands'
import { loadSimulation } from './index'

/**
 * One scenario per fault: the healthy mini cluster (shop/web, 2 replicas, a Service with a named port,
 * a ConfigMap and a Secret) and one timeline event that breaks it. Each test checks the evidence a
 * learner would gather: `kubectl get pods`, the pod's State and Last State (what `describe pod` shows,
 * E6-05), and its Events. E6-11 compares these structures with a real cluster.
 */
function broken(
  timeline: ScenarioInput['timeline'],
  images: ScenarioInput['images'] = {},
  tweak?: (c: Record<string, unknown>) => void,
) {
  const base = miniScenarioInput()
  const c0 = structuredClone(base.clusters[0]) as NonNullable<ScenarioInput['clusters']>[number]
  for (const r of c0.resources ?? []) {
    if (r.kind === 'Deployment') {
      const c = r.spec.template.spec.containers[0]
      if (c) {
        c.ports = [{ name: 'http', containerPort: 8080 }]
        c.env = [
          { name: 'MODE', valueFrom: { configMapKeyRef: { name: 'web-config', key: 'MODE' } } },
        ]
        c.readinessProbe = { httpGet: { path: '/ready', port: 'http' }, periodSeconds: 10 }
        tweak?.(c)
      }
    }
    if (r.kind === 'Service') r.spec.ports = [{ name: 'http', port: 80, targetPort: 'http' }]
  }
  return loadSimulation(
    scenarioSchema.parse({
      ...base,
      clusters: [c0],
      images: {
        'registry.example/web:1.0': { healthPaths: ['/ready', '/healthz'], memoryMi: 40 },
        ...images,
      },
      timeline,
    }),
  )
}

const at = (t: string, type: string, rest: Record<string, unknown>) => ({
  at: t,
  type,
  namespace: 'shop',
  ...rest,
})
const deploy = (image: string, behaviour?: Record<string, unknown>) =>
  at('+1m', 'setImage', {
    deployment: 'web',
    container: 'web',
    image,
    ...(behaviour ? { behaviour } : {}),
  })

/** The pod running the new template (or the newest pod). */
const newest = (sim: Simulator, image?: string): Pod => {
  const pods = sim
    .cluster()
    .list('Pod', { namespace: 'shop' })
    .filter((p) => !image || p.spec.containers[0]?.image === image)
  const p = pods.sort((a, b) =>
    a.metadata.creationTimestamp < b.metadata.creationTimestamp ? 1 : -1,
  )[0]
  if (!p) throw new Error('no pod')
  return p
}
const eventsFor = (sim: Simulator, pod: Pod) =>
  sim
    .cluster()
    .list('Event', { namespace: 'shop' })
    .filter((e) => e.involvedObject.uid === pod.metadata.uid)
    .map((e) => `${e.type} ${e.reason}: ${e.message}`)
const getPodsRow = (sim: Simulator, pod: Pod) =>
  createShell(sim)
    .run('kubectl get pods -n shop')
    .stdout.split('\n')
    .find((l) => l.startsWith(pod.metadata.name)) ?? ''

describe('E6-03 failure modes: evidence across get pods, state and events', () => {
  acTest(
    'E6-03.AC1',
    'bad image tag: ErrImagePull, then ImagePullBackOff; the old pods keep serving',
    () => {
      const sim = broken([deploy('registry.example/web:9.9', { pull: 'notFound' })])
      // Bound at 1:00; the pull fails about 1.3s later.
      sim.advance(60_000 + 1500)
      let pod = newest(sim, 'registry.example/web:9.9')
      expect(getPodsRow(sim, pod)).toMatch(/ 0\/1 +ErrImagePull +0 +/)
      sim.advance(2000)
      pod = newest(sim, 'registry.example/web:9.9')
      expect(getPodsRow(sim, pod)).toMatch(/ 0\/1 +ImagePullBackOff +0 +/)
      expect(pod.status.phase).toBe('Pending')
      const ref = 'registry.example/web:9.9'
      expect(pod.status.containerStatuses?.[0]?.state.waiting).toEqual({
        reason: 'ImagePullBackOff',
        message: `Back-off pulling image "${ref}": ErrImagePull: rpc error: code = NotFound desc = failed to pull and unpack image "${ref}": failed to resolve reference "${ref}": ${ref}: not found`,
      })
      expect(eventsFor(sim, pod)).toEqual(
        expect.arrayContaining([
          `Normal Pulling: Pulling image "${ref}"`,
          `Warning Failed: Failed to pull image "${ref}": rpc error: code = NotFound desc = failed to pull and unpack image "${ref}": failed to resolve reference "${ref}": ${ref}: not found`,
          'Warning Failed: Error: ErrImagePull',
          `Normal BackOff: Back-off pulling image "${ref}"`,
          'Warning Failed: Error: ImagePullBackOff',
        ]),
      )
      // It keeps retrying with backoff; the rollout stalls with the old pods still Ready.
      sim.advance(5 * 60_000)
      const pulling = sim
        .cluster()
        .list('Event', { namespace: 'shop' })
        .find((e) => e.involvedObject.uid === pod.metadata.uid && e.reason === 'Pulling')
      expect(pulling?.count).toBeGreaterThan(3)
      expect(sim.cluster().list('Pod', { namespace: 'shop' }).filter(isPodReady)).toHaveLength(2)
    },
  )

  acTest('E6-03.AC1', 'crash on start: exit code and CrashLoopBackOff', () => {
    const sim = broken([
      deploy('registry.example/web:1.1', {
        exitAfterMs: 1500,
        exitCode: 2,
        log: ['FATAL: missing SMTP_HOST'],
      }),
    ])
    sim.advance(60_000 + 40_000)
    const pod = newest(sim, 'registry.example/web:1.1')
    expect(getPodsRow(sim, pod)).toMatch(/ 0\/1 +CrashLoopBackOff +\d+ \(\d+s ago\) +/)
    const cs = pod.status.containerStatuses?.[0]
    expect(cs?.state.waiting?.reason).toBe('CrashLoopBackOff')
    expect(cs?.lastState.terminated).toMatchObject({ exitCode: 2, reason: 'Error' })
    expect(eventsFor(sim, pod)).toEqual(
      expect.arrayContaining([
        `Warning BackOff: Back-off restarting failed container web in pod ${pod.metadata.name}_shop(${pod.metadata.uid})`,
        'Normal Started: Started container web',
      ]),
    )
  })

  acTest('E6-03.AC1', 'memory over the limit: OOMKilled, exit 137', () => {
    const sim = broken([
      at('+1m', 'setResources', {
        deployment: 'web',
        container: 'web',
        limits: { memory: '32Mi' },
      }),
    ])
    sim.advance(60_000 + 20_000)
    const pod = newest(sim)
    expect(pod.spec.containers[0]?.resources?.limits?.memory).toBe('32Mi')
    const cs = pod.status.containerStatuses?.[0]
    expect(cs?.lastState.terminated).toMatchObject({ exitCode: 137, reason: 'OOMKilled' })
    expect(cs?.restartCount).toBeGreaterThanOrEqual(1)
    // Between restarts it's CrashLoopBackOff; right after a kill, get pods shows OOMKilled.
    expect(getPodsRow(sim, pod)).toMatch(/ [01]\/1 +(CrashLoopBackOff|OOMKilled|Running) +\d+/)
    expect(
      eventsFor(sim, pod).some((e) =>
        e.startsWith('Warning BackOff: Back-off restarting failed container web'),
      ),
    ).toBe(true)
  })

  acTest(
    'E6-03.AC1',
    'missing ConfigMap key: CreateContainerConfigError until it comes back',
    () => {
      const sim = broken([
        at('+1m', 'deleteConfigKey', { configMap: 'web-config', key: 'MODE' }),
        deploy('registry.example/web:1.0b'),
      ])
      sim.advance(60_000 + 5000)
      const pod = newest(sim, 'registry.example/web:1.0b')
      expect(getPodsRow(sim, pod)).toMatch(/ 0\/1 +CreateContainerConfigError +0 +/)
      expect(pod.status.containerStatuses?.[0]?.state.waiting).toEqual({
        reason: 'CreateContainerConfigError',
        message: "couldn't find key MODE in ConfigMap shop/web-config",
      })
      expect(eventsFor(sim, pod)).toContain(
        "Warning Failed: Error: couldn't find key MODE in ConfigMap shop/web-config",
      )
      // Running pods aren't affected: they read their config when they started.
      expect(sim.cluster().list('Pod', { namespace: 'shop' }).filter(isPodReady)).toHaveLength(2)
      // Put the key back and the kubelet's next retry starts it.
      const cm = sim.cluster().get('ConfigMap', 'shop', 'web-config')
      if (!cm) throw new Error('no configmap')
      cm.data.MODE = 'calm'
      sim.cluster().put(cm)
      sim.advance(30_000)
      expect(isPodReady(newest(sim, 'registry.example/web:1.0b'))).toBe(true)
    },
  )

  acTest('E6-03.AC1', 'missing Secret key: CreateContainerConfigError naming the Secret', () => {
    const sim = broken([deploy('registry.example/web:1.0c')], {}, (c) => {
      c.env = [
        { name: 'API_KEY', valueFrom: { secretKeyRef: { name: 'web-secret', key: 'api-key' } } },
      ]
    })
    sim.advance(60_000 + 5000)
    const pod = newest(sim, 'registry.example/web:1.0c')
    expect(pod.status.containerStatuses?.[0]?.state.waiting?.message).toBe(
      "couldn't find key api-key in Secret shop/web-secret",
    )
  })

  acTest(
    'E6-03.AC1',
    'readiness probe on the wrong path: Running but not Ready, and the Service has no endpoints for it',
    () => {
      const sim = broken([
        at('+1m', 'setServiceSelector', {
          service: 'web',
          selector: { app: 'web', track: 'canary' },
        }),
        at('+1m', 'setReadinessPath', { deployment: 'web', container: 'web', path: '/readyz' }),
      ])
      // With the selector widened to pods that don't exist yet, the Service has no endpoints at all.
      sim.advance(60_000)
      const svc = sim.cluster().get('Service', 'shop', 'web')
      if (!svc) throw new Error('no service')
      expect(sim.cluster().endpointsFor(svc).subsets).toEqual([])
      // Put the selector back: the new pod is listed as not ready, the old ones still serve.
      svc.spec.selector = { app: 'web' }
      sim.cluster().put(svc)
      sim.advance(30_000)
      const pod = newest(sim)
      expect(pod.spec.containers[0]?.readinessProbe?.httpGet?.path).toBe('/readyz')
      expect(getPodsRow(sim, pod)).toMatch(/ 0\/1 +Running +0 +/)
      expect(isPodReady(pod)).toBe(false)
      expect(eventsFor(sim, pod)).toContain(
        'Warning Unhealthy: Readiness probe failed: HTTP probe failed with statuscode: 404',
      )
      const ep = sim.cluster().endpointsFor(svc).subsets[0]
      expect(ep?.notReadyAddresses?.map((a) => a.targetRef?.name)).toContain(pod.metadata.name)
      expect(ep?.addresses?.map((a) => a.targetRef?.name)).not.toContain(pod.metadata.name)
      // The named target port resolves to the container port.
      expect(ep?.ports).toEqual([{ name: 'http', port: 8080, protocol: 'TCP' }])
    },
  )

  acTest('E6-03.AC1', 'requests larger than any node: Pending with FailedScheduling', () => {
    const sim = broken([
      at('+1m', 'setResources', {
        deployment: 'web',
        container: 'web',
        requests: { memory: '20Gi' },
      }),
    ])
    sim.advance(60_000 + 5000)
    const pod = newest(sim)
    expect(getPodsRow(sim, pod)).toMatch(/ 0\/1 +Pending +0 +/)
    expect(pod.spec.nodeName).toBeUndefined()
    const failed = sim
      .cluster()
      .list('Event', { namespace: 'shop' })
      .find((e) => e.reason === 'FailedScheduling')
    expect(failed?.type).toBe('Warning')
    expect(failed?.message).toMatch(
      /^0\/3 nodes are available: 2 Insufficient memory, 1 node\(s\) had untolerated taint/,
    )
  })
})

describe('E6-03 event wording', () => {
  acTest('E6-03.AC2', 'event reasons and messages use the real wording', () => {
    const crash = broken([deploy('registry.example/web:1.1', { exitAfterMs: 1000 })])
    crash.advance(2 * 60_000)
    const reasons = crash.cluster().list('Event', { namespace: 'shop' })
    expect(reasons.find((e) => e.reason === 'BackOff')?.message).toMatch(
      /^Back-off restarting failed container web in pod /,
    )
    expect(reasons.find((e) => e.reason === 'ScalingReplicaSet')?.message).toMatch(
      /^Scaled up replica set web-\w+ from 0 to 1$/,
    )
    expect(reasons.find((e) => e.reason === 'SuccessfulCreate')?.message).toMatch(
      /^Created pod: web-\w+-\w{5}$/,
    )
    expect(reasons.find((e) => e.reason === 'Scheduled')?.message).toMatch(
      /^Successfully assigned shop\/web-\w+-\w{5} to dev-w[12]$/,
    )
    expect(reasons.find((e) => e.reason === 'Created')?.message).toBe('Created container: web')
    // Repeats aggregate into one event with a count, as the event recorder does.
    const backoff = reasons.filter((e) => e.reason === 'BackOff')
    expect(backoff.length).toBeLessThan(backoff.reduce((n, e) => n + e.count, 0) + 1)
    expect(backoff[0]?.count).toBeGreaterThan(1)

    // Three nodes too small for the pod: the scheduler's sentence.
    const big = broken([
      at('+1m', 'setResources', {
        deployment: 'web',
        container: 'web',
        requests: { memory: '20Gi' },
      }),
    ])
    big.advance(65_000)
    expect(
      big
        .cluster()
        .list('Event', { namespace: 'shop' })
        .find((e) => e.reason === 'FailedScheduling')?.message,
    ).toBe(
      '0/3 nodes are available: 2 Insufficient memory, 1 node(s) had untolerated taint {node-role.kubernetes.io/control-plane: }. preemption: 0/3 nodes are available: 1 Preemption is not helpful for scheduling, 2 No preemption victims found for incoming pod.',
    )
  })
})
