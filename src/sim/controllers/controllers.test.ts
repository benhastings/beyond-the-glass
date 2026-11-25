import ravenpost from '@/scenarios/ravenpost.yaml'
import { describe, expect, it } from 'vitest'
import { acTest } from '@/test/ac'
import { isPodReady } from '../core/cluster'
import type { ScenarioInput } from '../core/scenario'
import { scenarioSchema } from '../core/scenario'
import type { Simulator } from '../core/simulator'
import { miniScenarioInput } from '../core/testing'
import {
  BACKOFF_RESET_MS,
  backoffMs,
  cpuMillis,
  formatGoDuration,
  loadSimulation,
  memoryBytes,
  restoreSimulation,
  rollbackDeployment,
  setImageBehaviour,
} from './index'

type Container = { name: string; image: string; [k: string]: unknown }

/** The mini scenario with the `web` Deployment adjusted. */
function scenario(
  patch: {
    replicas?: number
    strategy?: unknown
    container?: Partial<Container>
    timeline?: ScenarioInput['timeline']
    memory?: string
  } = {},
) {
  const base = miniScenarioInput()
  const c0 = base.clusters[0]
  if (!c0) throw new Error('fixture')
  const resources = (c0.resources ?? []).map((r) => {
    if (r.kind !== 'Deployment') return r
    const container = { ...r.spec.template.spec.containers[0], ...patch.container } as Container
    return {
      ...r,
      spec: {
        ...r.spec,
        replicas: patch.replicas ?? 3,
        ...(patch.strategy ? { strategy: patch.strategy } : {}),
        template: {
          ...r.spec.template,
          spec: { ...r.spec.template.spec, containers: [container] },
        },
      },
    }
  })
  const nodes = patch.memory ? c0.nodes.map((n) => ({ ...n, memory: patch.memory })) : c0.nodes
  return scenarioSchema.parse({
    ...base,
    clusters: [{ ...c0, nodes, resources }],
    timeline: patch.timeline ?? [],
  })
}

const setImage = (image: string, at = '+1m') => [
  { at, type: 'setImage', namespace: 'shop', deployment: 'web', container: 'web', image },
]
const scaling = (sim: Simulator) =>
  sim
    .cluster()
    .list('Event', { namespace: 'shop' })
    .filter((e) => e.reason === 'ScalingReplicaSet')
    .sort((a, b) =>
      a.lastTimestamp < b.lastTimestamp ? -1 : a.lastTimestamp > b.lastTimestamp ? 1 : 0,
    )
    .map((e) =>
      e.message.replace(/web-\w+/, (n) =>
        n === sim.cluster().get('Deployment', 'shop', 'web')?.metadata.name ? n : n,
      ),
    )
const webPods = (sim: Simulator) => sim.cluster().list('Pod', { namespace: 'shop' })
const rsName = (sim: Simulator, image: string) =>
  sim
    .cluster()
    .list('ReplicaSet', { namespace: 'shop' })
    .find((rs) => rs.spec.template.spec.containers[0]?.image === image)?.metadata.name ?? '?'

describe('Deployment rollouts', () => {
  acTest(
    'E6-02.AC1',
    'a v1 → v2 rolling update with 3 replicas scales ReplicaSets in the real sequence',
    () => {
      const sim = loadSimulation(scenario({ timeline: setImage('registry.example/web:2.0') }))
      sim.advance(5 * 60_000)
      const v1 = rsName(sim, 'registry.example/web:1.0')
      const v2 = rsName(sim, 'registry.example/web:2.0')
      // maxSurge 25% of 3 rounds up to 1, maxUnavailable 25% rounds down to 0: one new pod at a time,
      // and an old one goes only once the new one is available (docs/sim/lifecycle.md).
      expect(scaling(sim)).toEqual([
        `Scaled up replica set ${v2} from 0 to 1`,
        `Scaled down replica set ${v1} from 3 to 2`,
        `Scaled up replica set ${v2} from 1 to 2`,
        `Scaled down replica set ${v1} from 2 to 1`,
        `Scaled up replica set ${v2} from 2 to 3`,
        `Scaled down replica set ${v1} from 1 to 0`,
      ])
      const pods = webPods(sim)
      expect(pods).toHaveLength(3)
      expect(pods.every((p) => p.metadata.name.startsWith(`${v2}-`) && isPodReady(p))).toBe(true)
      const d = sim.cluster().get('Deployment', 'shop', 'web')
      expect(d?.metadata.annotations?.['deployment.kubernetes.io/revision']).toBe('2')
      expect(d?.status).toMatchObject({
        replicas: 3,
        updatedReplicas: 3,
        readyReplicas: 3,
        availableReplicas: 3,
      })
      expect(d?.status.conditions?.map((c) => c.reason)).toEqual([
        'MinimumReplicasAvailable',
        'NewReplicaSetAvailable',
      ])
    },
  )

  acTest(
    'E6-02.AC1',
    'availability never drops below replicas - maxUnavailable during the rollout',
    () => {
      const sim = loadSimulation(scenario({ timeline: setImage('registry.example/web:2.0') }))
      let sawProgressing = false
      for (let t = 0; t < 120; t++) {
        sim.advance(1000)
        const ready = webPods(sim).filter(
          (p) => isPodReady(p) && !p.metadata.deletionTimestamp,
        ).length
        expect(ready).toBeGreaterThanOrEqual(3)
        expect(
          webPods(sim).filter((p) => !p.metadata.deletionTimestamp).length,
        ).toBeLessThanOrEqual(4)
        if (
          sim
            .cluster()
            .get('Deployment', 'shop', 'web')
            ?.status.conditions?.some((c) => c.reason === 'ReplicaSetUpdated')
        )
          sawProgressing = true
      }
      expect(sawProgressing).toBe(true)
    },
  )

  acTest(
    'E6-02.AC1',
    'larger rollouts follow the same arithmetic (10 replicas: surge 3, unavailable 2)',
    () => {
      const sim = loadSimulation(
        scenario({ replicas: 10, timeline: setImage('registry.example/web:2.0') }),
      )
      sim.advance(10 * 60_000)
      const v1 = rsName(sim, 'registry.example/web:1.0')
      const v2 = rsName(sim, 'registry.example/web:2.0')
      const steps = scaling(sim)
      // First step: up by maxSurge (ceil 2.5 = 3) and down by maxUnavailable (floor 2.5 = 2) at once.
      expect(steps.slice(0, 2)).toEqual([
        `Scaled up replica set ${v2} from 0 to 3`,
        `Scaled down replica set ${v1} from 10 to 8`,
      ])
      expect(steps.at(-1)).toMatch(new RegExp(`Scaled down replica set ${v1} from \\d+ to 0`))
      expect(webPods(sim).filter(isPodReady)).toHaveLength(10)
    },
  )

  it('Recreate stops every old pod before starting new ones', () => {
    const sim = loadSimulation(
      scenario({ strategy: { type: 'Recreate' }, timeline: setImage('registry.example/web:2.0') }),
    )
    sim.advance(60_000)
    sim.advance(1000)
    expect(
      webPods(sim).every(
        (p) => p.metadata.deletionTimestamp || p.spec.containers[0]?.image.endsWith('1.0'),
      ),
    ).toBe(true)
    sim.advance(5 * 60_000)
    const v1 = rsName(sim, 'registry.example/web:1.0')
    const v2 = rsName(sim, 'registry.example/web:2.0')
    expect(scaling(sim)).toEqual([
      `Scaled down replica set ${v1} from 3 to 0`,
      `Scaled up replica set ${v2} from 0 to 3`,
    ])
  })

  it('rollout undo returns to the previous template as a new revision, and keeps history', () => {
    const sim = loadSimulation(scenario({ timeline: setImage('registry.example/web:2.0') }))
    sim.advance(5 * 60_000)
    const c = sim.cluster()
    const d = c.get('Deployment', 'shop', 'web')
    if (!d) throw new Error('no deployment')
    expect(rollbackDeployment(sim, c, d)).toEqual({ revision: 1 })
    sim.advance(5 * 60_000)
    expect(c.get('Deployment', 'shop', 'web')?.spec.template.spec.containers[0]?.image).toBe(
      'registry.example/web:1.0',
    )
    expect(
      c.get('Deployment', 'shop', 'web')?.metadata.annotations?.[
        'deployment.kubernetes.io/revision'
      ],
    ).toBe('3')
    expect(
      webPods(sim).every(
        (p) => p.spec.containers[0]?.image === 'registry.example/web:1.0' && isPodReady(p),
      ),
    ).toBe(true)
    expect(c.list('ReplicaSet', { namespace: 'shop' })).toHaveLength(2)
    expect(rollbackDeployment(sim, c, d, 9)).toEqual({
      error: 'error: unable to find specified revision 9 in history',
    })
    const fresh = loadSimulation(scenario())
    const fd = fresh.cluster().get('Deployment', 'shop', 'web')
    if (!fd) throw new Error('no deployment')
    expect(rollbackDeployment(fresh, fresh.cluster(), fd)).toEqual({
      error: 'error: no rollout history found for deployment',
    })
  })

  it('keeps at most revisionHistoryLimit old ReplicaSets', () => {
    const images = [2, 3, 4, 5].map(
      (v) => setImage(`registry.example/web:${String(v)}.0`, `+${String(v)}m`)[0],
    )
    const s = scenario({ timeline: images as ScenarioInput['timeline'] })
    const d = s.clusters[0]?.resources.find((r) => r.kind === 'Deployment')
    if (d?.kind === 'Deployment') d.spec.revisionHistoryLimit = 2
    const sim = loadSimulation(s)
    sim.advance(15 * 60_000)
    expect(
      sim
        .cluster()
        .list('ReplicaSet', { namespace: 'shop' })
        .map((rs) => rs.spec.template.spec.containers[0]?.image),
    ).toEqual(expect.arrayContaining(['registry.example/web:5.0']))
    expect(sim.cluster().list('ReplicaSet', { namespace: 'shop' })).toHaveLength(3)
  })

  it('a deleted pod is replaced by a new one with a new name', () => {
    const sim = loadSimulation(scenario())
    const [victim] = webPods(sim)
    if (!victim) throw new Error('no pod')
    victim.metadata.deletionTimestamp = sim.clock.iso()
    sim.cluster().put(victim)
    sim.reconcile()
    sim.advance(30_000)
    const names = webPods(sim).map((p) => p.metadata.name)
    expect(names).not.toContain(victim.metadata.name)
    expect(names).toHaveLength(3)
    expect(webPods(sim).every(isPodReady)).toBe(true)
    const events = sim
      .cluster()
      .list('Event', { namespace: 'shop' })
      .map((e) => e.reason)
    expect(events).toEqual(
      expect.arrayContaining(['Killing', 'SuccessfulCreate', 'Scheduled', 'Started']),
    )
  })
})

describe('pod lifecycle', () => {
  it('a new pod goes Pending → ContainerCreating → Running, then Ready after its readiness probe', () => {
    const sim = loadSimulation(
      scenario({
        container: {
          image: 'registry.example/new:1',
          readinessProbe: { httpGet: { path: '/ready', port: 8080 }, initialDelaySeconds: 5 },
        },
        replicas: 1,
      }),
    )
    // The scenario's own pod is already running; scale up for a fresh one.
    const d = sim.cluster().get('Deployment', 'shop', 'web')
    if (!d) throw new Error('no deployment')
    d.spec.replicas = 2
    sim.cluster().put(d)
    sim.reconcile()
    const fresh = () =>
      webPods(sim).find(
        (p) => !p.status.containerStatuses?.[0]?.state.running || p.status.phase === 'Pending',
      )
    const pod = fresh()
    expect(pod?.status.phase).toBe('Pending')
    expect(pod?.spec.nodeName).toBeTruthy()
    expect(pod?.status.containerStatuses?.[0]?.state.waiting?.reason).toBe('ContainerCreating')
    sim.advance(4500)
    const running = webPods(sim).find((p) => p.metadata.uid === pod?.metadata.uid)
    expect(running?.status.phase).toBe('Running')
    expect(running?.status.podIP).toMatch(/^10\.244\./)
    expect(running && isPodReady(running)).toBe(false)
    sim.advance(6000)
    const ready = webPods(sim).find((p) => p.metadata.uid === pod?.metadata.uid)
    expect(ready && isPodReady(ready)).toBe(true)
    const reasons = sim
      .cluster()
      .list('Event', { namespace: 'shop' })
      .filter((e) => e.involvedObject.uid === pod?.metadata.uid)
      .map((e) => e.reason)
    expect(reasons).toEqual(expect.arrayContaining(['Scheduled', 'Created', 'Started', 'Pulled']))
  })

  it('an image already on the node is reported as present, not pulled', () => {
    const sim = loadSimulation(scenario({ replicas: 1 }))
    const d = sim.cluster().get('Deployment', 'shop', 'web')
    if (!d) throw new Error('no deployment')
    d.spec.replicas = 4
    sim.cluster().put(d)
    sim.reconcile()
    sim.advance(30_000)
    const pulled = sim
      .cluster()
      .list('Event', { namespace: 'shop' })
      .filter((e) => e.reason === 'Pulled')
      .map((e) => e.message)
    expect(
      pulled.some((m) =>
        m.startsWith('Container image "registry.example/web:1.0" already present on machine'),
      ),
    ).toBe(true)
  })

  it('readiness failures keep a pod out of service; liveness failures restart it', () => {
    const sim = loadSimulation(
      scenario({
        replicas: 1,
        container: {
          image: 'registry.example/flaky:1',
          readinessProbe: { httpGet: { path: '/ready', port: 8080 }, periodSeconds: 10 },
          livenessProbe: {
            httpGet: { path: '/healthz', port: 8080 },
            periodSeconds: 10,
            failureThreshold: 3,
          },
        },
        timeline: setImage('registry.example/flaky:2', '+10s'),
      }),
    )
    setImageBehaviour(sim, 'registry.example/flaky:2', { readiness: 'fail', liveness: 'fail' })
    sim.advance(60_000)
    const pod = webPods(sim).find((p) => p.spec.containers[0]?.image === 'registry.example/flaky:2')
    expect(pod && isPodReady(pod)).toBe(false)
    expect(pod?.status.containerStatuses?.[0]?.restartCount).toBeGreaterThanOrEqual(1)
    expect(pod?.status.containerStatuses?.[0]?.lastState.terminated).toMatchObject({
      exitCode: 137,
      reason: 'Error',
    })
    const messages = sim
      .cluster()
      .list('Event', { namespace: 'shop' })
      .map((e) => `${e.reason}: ${e.message}`)
    expect(messages).toEqual(
      expect.arrayContaining([
        'Unhealthy: Readiness probe failed: HTTP probe failed with statuscode: 503',
        'Unhealthy: Liveness probe failed: HTTP probe failed with statuscode: 500',
        'Killing: Container web failed liveness probe, will be restarted',
      ]),
    )
    // The rollout stalls: the old pod stays because the new one never becomes available.
    expect(
      webPods(sim).some(
        (p) => p.spec.containers[0]?.image === 'registry.example/flaky:1' && isPodReady(p),
      ),
    ).toBe(true)
  })
})

describe('restarts and backoff', () => {
  acTest(
    'E6-02.AC2',
    'restart delays follow kubelet’s schedule: 10s, 20s, 40s … capped at 5 minutes',
    () => {
      expect([0, 1, 2, 3, 4, 5, 6, 9].map(backoffMs)).toEqual([
        10_000, 20_000, 40_000, 80_000, 160_000, 300_000, 300_000, 300_000,
      ])
      expect([10_000, 80_000, 300_000].map(formatGoDuration)).toEqual(['10s', '1m20s', '5m0s'])

      const sim = loadSimulation(
        scenario({ replicas: 1, timeline: setImage('registry.example/crash:1', '+10s') }),
      )
      setImageBehaviour(sim, 'registry.example/crash:1', { exitAfterMs: 1000, exitCode: 1 })
      const restartsAt: number[] = []
      let last = 0
      for (let t = 0; t < 20 * 60; t++) {
        sim.advance(1000)
        const cs = webPods(sim).find(
          (p) => p.spec.containers[0]?.image === 'registry.example/crash:1',
        )?.status.containerStatuses?.[0]
        if (cs && cs.restartCount > last) {
          last = cs.restartCount
          restartsAt.push(sim.now)
        }
      }
      // Each container runs 1s, so the gap between restarts is backoff + 1s.
      const gaps = restartsAt.slice(1).map((t, i) => (t - (restartsAt[i] ?? 0)) / 1000)
      expect(gaps.slice(0, 6)).toEqual([21, 41, 81, 161, 301, 301])
      expect(last).toBe(restartsAt.length)
    },
  )

  acTest(
    'E6-02.AC2',
    'restart counts, states and events read like kubectl describe while crash-looping',
    () => {
      const sim = loadSimulation(
        scenario({ replicas: 1, timeline: setImage('registry.example/crash:1', '+10s') }),
      )
      setImageBehaviour(sim, 'registry.example/crash:1', { exitAfterMs: 2000, exitCode: 3 })
      // Runs 2s, waits 10s, runs 2s, waits 20s, runs 2s: then the wait is 40s.
      for (let i = 0; i < 200; i++) {
        sim.advance(1000)
        const c = webPods(sim).find(
          (p) => p.spec.containers[0]?.image === 'registry.example/crash:1',
        )?.status.containerStatuses?.[0]
        if (c?.restartCount === 2 && c.state.waiting) break
      }
      const pod = webPods(sim).find(
        (p) => p.spec.containers[0]?.image === 'registry.example/crash:1',
      )
      const cs = pod?.status.containerStatuses?.[0]
      expect(cs?.restartCount).toBe(2)
      expect(cs?.state.waiting).toEqual({
        reason: 'CrashLoopBackOff',
        message: `back-off 40s restarting failed container=web pod=${pod?.metadata.name ?? ''}_shop(${pod?.metadata.uid ?? ''})`,
      })
      expect(cs?.lastState.terminated).toMatchObject({ exitCode: 3, reason: 'Error' })
      const backoff = sim
        .cluster()
        .list('Event', { namespace: 'shop' })
        .find((e) => e.reason === 'BackOff')
      expect(backoff).toMatchObject({ type: 'Warning', count: 3 })
      expect(backoff?.message).toBe(
        `Back-off restarting failed container web in pod ${pod?.metadata.name ?? ''}_shop(${pod?.metadata.uid ?? ''})`,
      )
    },
  )

  acTest('E6-02.AC2', 'the backoff resets after a container runs for 10 minutes', () => {
    const sim = loadSimulation(
      scenario({ replicas: 1, timeline: setImage('registry.example/crash:1', '+10s') }),
    )
    setImageBehaviour(sim, 'registry.example/crash:1', { exitAfterMs: 1000 })
    sim.advance(10 * 60_000)
    const status = () =>
      webPods(sim).find((p) => p.spec.containers[0]?.image === 'registry.example/crash:1')?.status
        .containerStatuses?.[0]
    expect(status()?.restartCount).toBeGreaterThan(3)
    expect(status()?.state.waiting?.message).toMatch(/^back-off (2m40s|5m0s) /)
    // From the next start it stays up past the reset window before exiting again.
    setImageBehaviour(sim, 'registry.example/crash:1', { exitAfterMs: BACKOFF_RESET_MS + 1000 })
    // Wait out the current backoff and a run longer than the reset window, until it exits again.
    sim.advance(5 * 60_000 + 2000)
    expect(status()?.state.running).toBeDefined()
    for (let i = 0; i < 20 * 60 && status()?.state.running; i++) sim.advance(1000)
    expect(status()?.state.waiting?.message).toMatch(/^back-off 10s /)
  })

  it('the ravenpost notifier keeps crash-looping at the 5-minute cap; nothing else changes', () => {
    const sim = loadSimulation(ravenpost)
    const before = sim
      .cluster()
      .list('Pod', { namespace: 'ravenpost' })
      .map((p) => p.metadata.name)
    sim.advance(30 * 60_000)
    const pods = sim.cluster().list('Pod', { namespace: 'ravenpost' })
    expect(pods.map((p) => p.metadata.name)).toEqual(before)
    const notifier = pods.find((p) => p.metadata.name.startsWith('ravenpost-notifier'))
    expect(notifier?.status.containerStatuses?.[0]?.restartCount).toBe(15)
    expect(notifier?.status.containerStatuses?.[0]?.state.waiting?.message).toMatch(
      /^back-off 5m0s /,
    )
    expect(pods.filter((p) => p !== notifier).every(isPodReady)).toBe(true)
  })
})

describe('scheduling', () => {
  it('a pod that fits nowhere stays Pending with the scheduler’s reasons, and runs once room is made', () => {
    const sim = loadSimulation(scenario({ replicas: 1, memory: '1Gi' }))
    const d = sim.cluster().get('Deployment', 'shop', 'web')
    if (!d) throw new Error('no deployment')
    const c = d.spec.template.spec.containers[0]
    if (!c) throw new Error('no container')
    c.resources = { requests: { cpu: '100m', memory: '2Gi' } }
    sim.cluster().put(d)
    sim.reconcile()
    sim.advance(60_000)
    const pending = webPods(sim).find((p) => p.status.phase === 'Pending')
    expect(pending?.spec.nodeName).toBeUndefined()
    const cond = pending?.status.conditions?.find((x) => x.type === 'PodScheduled')
    expect(cond).toMatchObject({ status: 'False', reason: 'Unschedulable' })
    expect(cond?.message).toBe(
      '0/3 nodes are available: 2 Insufficient memory, 1 node(s) had untolerated taint {node-role.kubernetes.io/control-plane: }. preemption: 0/3 nodes are available: 1 Preemption is not helpful for scheduling, 2 No preemption victims found for incoming pod.',
    )
    const failed = sim
      .cluster()
      .list('Event', { namespace: 'shop' })
      .filter((e) => e.reason === 'FailedScheduling')
    expect(failed).toHaveLength(1)
    // Smaller requests fit, and the stuck rollout completes.
    c.resources = { requests: { cpu: '100m', memory: '64Mi' } }
    sim.cluster().put(d)
    sim.reconcile()
    sim.advance(5 * 60_000)
    expect(webPods(sim).every((p) => p.spec.nodeName && isPodReady(p))).toBe(true)
  })

  it('parses resource quantities', () => {
    expect([
      cpuMillis('250m'),
      cpuMillis('2'),
      cpuMillis('0.5'),
      cpuMillis(undefined),
      cpuMillis('lots'),
    ]).toEqual([250, 2000, 500, 0, 0])
    expect([
      memoryBytes('64Mi'),
      memoryBytes('1Gi'),
      memoryBytes('1G'),
      memoryBytes('512'),
      memoryBytes('x'),
    ]).toEqual([64 * 1024 ** 2, 1024 ** 3, 1e9, 512, 0])
  })
})

describe('determinism with controllers', () => {
  it('snapshot mid-rollout → restore → continue matches an uninterrupted run', () => {
    const s = scenario({ timeline: setImage('registry.example/web:2.0') })
    const straight = loadSimulation(s)
    straight.advance(60_000 + 4000)
    straight.advance(5 * 60_000)
    const first = loadSimulation(s)
    first.advance(60_000 + 4000)
    const resumed = restoreSimulation(s, JSON.parse(JSON.stringify(first.snapshot())))
    resumed.advance(5 * 60_000)
    expect(JSON.stringify(resumed.snapshot())).toBe(JSON.stringify(straight.snapshot()))
  })
})
