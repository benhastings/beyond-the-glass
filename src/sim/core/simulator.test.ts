import ravenpost from '@/scenarios/ravenpost.yaml'
import { describe, expect, it } from 'vitest'
import { acTest } from '@/test/ac'
import { isPodReady } from './cluster'
import { Simulator, type Controller } from './simulator'
import { miniScenario } from './testing'

/**
 * A controller that exercises everything a real one would (E6-02): it consumes the RNG, records
 * events, creates objects and schedules its own wakeups.
 */
function noisyController(): Controller {
  return {
    name: 'noisy',
    reconcile: (sim) => {
      const c = sim.cluster()
      const web = c.get('Deployment', 'shop', 'web')
      const image = web?.spec.template.spec.containers[0]?.image ?? ''
      const cm = c.get('ConfigMap', 'shop', 'seen')
      if (!cm || cm.data.image !== image) {
        c.put<'ConfigMap'>({
          apiVersion: 'v1',
          kind: 'ConfigMap',
          metadata: {
            name: 'seen',
            namespace: 'shop',
            uid: '',
            resourceVersion: '',
            creationTimestamp: '',
          },
          data: { image, roll: String(sim.rng.int(1_000_000)) },
        })
      }
      if (sim.nextWakeup === undefined)
        sim.schedule(sim.now + 30_000 + sim.rng.int(30_000), 'noisy', { n: sim.rng.int(9) })
    },
    wake: (sim, payload) => {
      const pod = sim.cluster().list('Pod', { namespace: 'shop' })[0]
      if (pod)
        sim
          .cluster()
          .recordEvent(
            { kind: 'Pod', name: pod.metadata.name, namespace: 'shop', uid: pod.metadata.uid },
            'Normal',
            'Tick',
            `tick ${JSON.stringify(payload)}`,
            { component: 'noisy' },
          )
    },
  }
}

const timeline = [
  { at: '+2m', type: 'load', namespace: 'shop', service: 'web', rps: 40 },
  {
    at: '+4m',
    type: 'setImage',
    namespace: 'shop',
    deployment: 'web',
    container: 'web',
    image: 'registry.example/web:2.0',
  },
  { at: '+6m', type: 'injectLatency', namespace: 'shop', service: 'web', ms: 350 },
  { at: '+7m', type: 'deleteConfigKey', namespace: 'shop', configMap: 'web-config', key: 'MODE' },
  {
    at: '+8m',
    type: 'setMemoryLimit',
    namespace: 'shop',
    deployment: 'web',
    container: 'web',
    limit: '32Mi',
  },
]

describe('Simulator', () => {
  acTest('E6-01.AC2', 'snapshot → restore → continue matches an uninterrupted run', () => {
    const scenario = miniScenario({ timeline })
    const opts = () => ({ controllers: [noisyController()] })

    const straight = Simulator.load(scenario, opts())
    straight.advance(3 * 60_000)
    straight.advance(9 * 60_000)

    const first = Simulator.load(scenario, opts())
    first.advance(3 * 60_000)
    // Through JSON, the way the progress store keeps it.
    const saved: unknown = JSON.parse(JSON.stringify(first.snapshot()))
    const resumed = Simulator.restore(scenario, saved, opts())
    resumed.advance(9 * 60_000)

    expect(resumed.snapshot()).toEqual(straight.snapshot())
    expect(JSON.stringify(resumed.snapshot())).toBe(JSON.stringify(straight.snapshot()))
    // The run did something worth comparing: timeline events and controller wakeups both happened.
    const c = resumed.cluster()
    expect(c.get('ConfigMap', 'shop', 'seen')?.data.image).toBe('registry.example/web:2.0')
    expect(c.list('Event', { namespace: 'shop' }).length).toBeGreaterThan(0)
  })

  acTest('E6-01.AC2', 'restoring twice from one snapshot gives two identical futures', () => {
    const scenario = miniScenario({ timeline })
    const sim = Simulator.load(scenario, { controllers: [noisyController()] })
    sim.advance(5 * 60_000)
    const snap = sim.snapshot()
    const a = Simulator.restore(scenario, snap, { controllers: [noisyController()] })
    const b = Simulator.restore(scenario, snap, { controllers: [noisyController()] })
    a.advance(600_000)
    b.advance(600_000)
    expect(a.snapshot()).toEqual(b.snapshot())
    // The snapshot itself was not changed by either run.
    expect(snap).toEqual(sim.snapshot())
  })

  it('is deterministic per seed', () => {
    const scenario = miniScenario()
    expect(Simulator.load(scenario).snapshot()).toEqual(Simulator.load(scenario).snapshot())
    expect(Simulator.load(scenario, { seed: 6 }).snapshot()).not.toEqual(
      Simulator.load(scenario).snapshot(),
    )
  })

  it('applies each timeline event when its time comes, not before', () => {
    const sim = Simulator.load(miniScenario({ timeline }))
    const c = sim.cluster()
    const image = () => c.get('Deployment', 'shop', 'web')?.spec.template.spec.containers[0]?.image
    sim.advance(239_000)
    expect(image()).toBe('registry.example/web:1.0')
    expect(sim.traffic('dev', 'shop', 'web')).toEqual({ rps: 40 })
    sim.advance(1000)
    expect(image()).toBe('registry.example/web:2.0')
    expect(c.get('Deployment', 'shop', 'web')?.metadata.generation).toBe(2)
    sim.advanceTo(8 * 60_000)
    expect(sim.traffic('dev', 'shop', 'web')).toEqual({ rps: 40, latencyMs: 350 })
    expect(c.get('ConfigMap', 'shop', 'web-config')?.data).toEqual({ GREETING: 'hello' })
    expect(
      c.get('Deployment', 'shop', 'web')?.spec.template.spec.containers[0]?.resources?.limits,
    ).toEqual({
      cpu: '100m',
      memory: '32Mi',
    })
    expect(sim.nextWakeup).toBeUndefined()
    expect(sim.now).toBe(480_000)
  })

  it('applies +0s events on load', () => {
    const sim = Simulator.load(
      miniScenario({
        timeline: [{ at: '+0s', type: 'load', namespace: 'shop', service: 'web', rps: 5 }],
      }),
    )
    expect(sim.traffic('dev', 'shop', 'web')).toEqual({ rps: 5 })
  })

  it('runs wakeups at the same time in the order they were scheduled', () => {
    const order: string[] = []
    const ctl: Controller = {
      name: 'order',
      reconcile: () => undefined,
      wake: (_sim, p) => order.push(String(p)),
    }
    const sim = Simulator.load(miniScenario(), { controllers: [ctl] })
    sim.schedule(1000, 'order', 'b')
    sim.schedule(500, 'order', 'a')
    sim.schedule(1000, 'order', 'c')
    sim.schedule(-5, 'order', 'now')
    sim.advance(2000)
    expect(order).toEqual(['now', 'a', 'b', 'c'])
    expect(() => {
      sim.schedule(1, 'missing')
    }).toThrow(RangeError)
    expect(() => {
      sim.advance(-1)
    }).toThrow(RangeError)
  })

  it('switches contexts and exposes clusters', () => {
    const base = miniScenario()
    const c0 = base.clusters[0]
    if (!c0) throw new Error('fixture')
    const scenario = {
      ...base,
      clusters: [c0, { ...c0, name: 'prod', server: 'https://prod.example:6443' }],
      contexts: [...base.contexts, { name: 'prod', cluster: 'prod', user: 'prod-admin' }],
    }
    const sim = Simulator.load(scenario)
    expect(sim.currentContext).toBe('dev')
    expect(sim.namespace()).toBe('shop')
    expect(sim.cluster().name).toBe('dev')
    sim.useContext('prod')
    expect(sim.cluster().name).toBe('prod')
    expect(sim.namespace()).toBe('default')
    expect(sim.contexts.map((c) => c.name)).toEqual(['dev', 'prod'])
    expect(sim.clusterNames).toEqual(['dev', 'prod'])
    expect(sim.clusterByName('prod')?.server).toBe('https://prod.example:6443')
    expect(() => {
      sim.useContext('stage')
    }).toThrow(RangeError)
    expect(() => sim.cluster('stage')).toThrow(RangeError)
    expect(Simulator.restore(scenario, sim.snapshot()).currentContext).toBe('prod')
  })

  it('refuses a snapshot from another scenario or one that is not a snapshot', () => {
    const sim = Simulator.load(miniScenario())
    expect(() => Simulator.restore({ ...miniScenario(), id: 'other' }, sim.snapshot())).toThrow(
      /scenario "mini"/,
    )
    expect(() => Simulator.restore(miniScenario(), { version: 99 })).toThrow(TypeError)
    expect(() => Simulator.restore(miniScenario(), null)).toThrow(TypeError)
  })
})

describe('the ravenpost baseline scenario', () => {
  acTest('E6-01.AC4', 'is healthy except one pod', () => {
    const sim = Simulator.load(ravenpost)
    const pods = sim.cluster().list('Pod', { namespace: 'ravenpost' })
    expect(pods.length).toBeGreaterThanOrEqual(6)
    const unhealthy = pods.filter((p) => !isPodReady(p))
    expect(unhealthy).toHaveLength(1)
    const [bad] = unhealthy
    expect(bad?.metadata.name).toMatch(
      /^ravenpost-notifier-[bcdfghjklmnpqrstvwxz2456789]{1,10}-[bcdfghjklmnpqrstvwxz2456789]{5}$/,
    )
    expect(bad?.status.containerStatuses?.[0]?.state.waiting?.reason).toBe('CrashLoopBackOff')
    expect(bad?.status.containerStatuses?.[0]?.lastState.terminated?.exitCode).toBe(1)
    for (const p of pods.filter((x) => x !== bad)) {
      expect(p.status.phase).toBe('Running')
      expect(p.status.containerStatuses?.every((s) => s.ready && s.restartCount === 0)).toBe(true)
    }
  })

  acTest('E6-01.AC4', 'has the cluster around it that `kubectl get pods -A` expects', () => {
    const sim = Simulator.load(ravenpost)
    const c = sim.cluster()
    expect(sim.currentContext).toBe('kind-ravenpost')
    expect(c.namespaces()).toEqual([
      'default',
      'kube-node-lease',
      'kube-public',
      'kube-system',
      'local-path-storage',
      'ravenpost',
    ])
    const system = c
      .list('Pod', { namespace: 'kube-system' })
      .map((p) => p.metadata.name.replace(/-[bcdfghjklmnpqrstvwxz2456789]{5}$/, '-*'))
    expect(system).toEqual(
      expect.arrayContaining([
        'etcd-ravenpost-control-plane',
        'kube-apiserver-ravenpost-control-plane',
        'kube-controller-manager-ravenpost-control-plane',
        'kube-scheduler-ravenpost-control-plane',
        'kube-proxy-*',
        'kindnet-*',
      ]),
    )
    expect(c.list('Pod').filter((p) => !isPodReady(p))).toHaveLength(1)
    expect(c.list('Node').map((n) => n.metadata.name)).toEqual([
      'ravenpost-control-plane',
      'ravenpost-worker',
      'ravenpost-worker2',
    ])
    // Workloads run on the workers, never on the tainted control plane.
    for (const p of c.list('Pod', { namespace: 'ravenpost' }))
      expect(p.spec.nodeName).not.toBe('ravenpost-control-plane')
    const notifier = c.get('Service', 'ravenpost', 'ravenpost-notifier')
    expect(notifier && c.endpointsFor(notifier).subsets[0]?.addresses).toBeUndefined()
    expect(c.get('Deployment', 'ravenpost', 'ravenpost-notifier')?.status.availableReplicas).toBe(0)
  })

  it('never keeps secret values', () => {
    const sim = Simulator.load(ravenpost)
    const snapshot = JSON.stringify(sim.snapshot())
    expect(snapshot).not.toContain('not-a-real-password')
    expect(sim.cluster().get('Secret', 'ravenpost', 'ravenpost-db')?.data).toEqual({
      DB_USER: { redacted: true, bytes: 9 },
      DB_PASSWORD: { redacted: true, bytes: 19 },
    })
  })
})
