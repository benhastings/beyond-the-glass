import type { Cluster } from '../core/cluster.ts'
import { imageId, digestOf } from '../core/names.ts'
import { condition, nextPodIP } from '../core/pods.ts'
import type { ContainerStatus, ObjectReference, Pod, Probe } from '../core/resources.ts'
import type { Controller, Simulator } from '../core/simulator.ts'
import { behaviourOf, setPodBehaviour } from './behaviour.ts'

/**
 * The kubelet: takes a bound pod through ContainerCreating to Running, runs readiness and liveness
 * probes, restarts exited containers with kubelet's backoff, and removes deleted pods after they stop.
 * Every step is a scheduled wakeup, so time only passes when the simulation advances.
 */

/** Delay before restart number n+1 (n restarts so far): 10s, 20s, 40s, … capped at 5 minutes. */
export function backoffMs(n: number): number {
  return Math.min(10_000 * 2 ** n, 300_000)
}
/** A container that ran this long before exiting starts its backoff again from 10s. */
export const BACKOFF_RESET_MS = 600_000
/** How long a deleted pod takes to stop (its containers exit promptly on SIGTERM). */
export const STOP_MS = 2_000
const DEFAULT_PERIOD_S = 10
const DEFAULT_FAILURE_THRESHOLD = 3

type Action =
  'pulled' | 'started' | 'ready' | 'unready' | 'exit' | 'liveness' | 'restart' | 'removed'

interface Wake extends Record<string, unknown> {
  cluster: string
  uid: string
  container?: string
  action: Action
  /** The container's restart count when this was scheduled; a wakeup from an earlier life is ignored. */
  life?: number
}

interface KubeletState extends Record<string, unknown> {
  /** Pods (uid) whose startup or stop is already under way. */
  handled: Record<string, true>
  /** Images pulled per node. */
  images: Record<string, string[]>
  /** Backoff step per `<uid>/<container>`. */
  backoff: Record<string, number>
}

const kstate = (sim: Simulator) =>
  sim.state<KubeletState>('kubelet', () => ({ handled: {}, images: {}, backoff: {} }))

const refOf = (p: Pod, container?: string): ObjectReference => ({
  kind: 'Pod',
  name: p.metadata.name,
  namespace: p.metadata.namespace ?? 'default',
  uid: p.metadata.uid,
  apiVersion: 'v1',
  ...(container ? { fieldPath: `spec.containers{${container}}` } : {}),
})

function event(
  cluster: Cluster,
  p: Pod,
  container: string | undefined,
  type: 'Normal' | 'Warning',
  reason: string,
  message: string,
) {
  cluster.recordEvent(refOf(p, container), type, reason, message, {
    component: 'kubelet',
    ...(p.spec.nodeName ? { host: p.spec.nodeName } : {}),
  })
}

function findPod(cluster: Cluster, uid: string): Pod | undefined {
  return cluster.list('Pod').find((p) => p.metadata.uid === uid)
}

const probeDelay = (p: Probe | undefined) => (p?.initialDelaySeconds ?? 0) * 1000
const probePeriod = (p: Probe | undefined) => (p?.periodSeconds ?? DEFAULT_PERIOD_S) * 1000

function probeTarget(p: Probe): string {
  if (p.httpGet) return 'HTTP probe failed with statuscode: 503'
  if (p.tcpSocket) return `dial tcp: connect: connection refused`
  return 'command exited with non-zero code 1'
}

/** Recomputes the pod's Ready/ContainersReady conditions and phase from its containers. */
function refreshPod(sim: Simulator, pod: Pod): void {
  const now = sim.clock.iso()
  const statuses = pod.status.containerStatuses ?? []
  const allReady = statuses.length > 0 && statuses.every((c) => c.ready)
  const anyStarted = statuses.some(
    (c) => c.state.running || c.lastState.terminated || c.restartCount > 0,
  )
  if (anyStarted && pod.status.phase === 'Pending') pod.status.phase = 'Running'
  const set = (type: string, value: boolean, extra = {}) => {
    const conds = pod.status.conditions ?? []
    const old = conds.find((c) => c.type === type)
    const status = value ? 'True' : 'False'
    if (old?.status === status) return
    const notReady = statuses.filter((c) => !c.ready).map((c) => c.name)
    const next = condition(type, value, now, {
      lastProbeTime: null,
      ...(value
        ? {}
        : {
            reason: 'ContainersNotReady',
            message: `containers with unready status: [${notReady.join(' ')}]`,
          }),
      ...extra,
    })
    pod.status.conditions = old ? conds.map((c) => (c.type === type ? next : c)) : [...conds, next]
  }
  set('Ready', allReady)
  set('ContainersReady', allReady)
}

function schedule(sim: Simulator, at: number, w: Wake) {
  sim.schedule(at, 'kubelet', w)
}

/** A bound pod starts: pull (or reuse) each image, then create and start its containers. */
function beginStartup(sim: Simulator, cluster: Cluster, pod: Pod) {
  const st = kstate(sim)
  st.handled[pod.metadata.uid] = true
  const node = pod.spec.nodeName ?? ''
  const pulled = (st.images[node] ??= [])
  const now = sim.clock.now
  pod.status.phase = 'Pending'
  pod.status.startTime ??= sim.clock.iso()
  const hostIP = cluster
    .get('Node', undefined, node)
    ?.status.addresses.find((a) => a.type === 'InternalIP')?.address
  if (hostIP) pod.status.hostIP = hostIP
  pod.status.podIP ??= nextPodIP(cluster, node)
  pod.status.containerStatuses = pod.spec.containers.map((c) => ({
    name: c.name,
    image: c.image,
    imageID: '',
    ready: false,
    started: false,
    restartCount: 0,
    state: { waiting: { reason: 'ContainerCreating' } },
    lastState: {},
  }))
  pod.status.conditions = [
    ...(pod.status.conditions ?? []).filter((c) => c.type === 'PodScheduled'),
    condition('PodReadyToStartContainers', false, sim.clock.iso(), { lastProbeTime: null }),
    condition('Initialized', true, sim.clock.iso(), { lastProbeTime: null }),
  ]
  refreshPod(sim, pod)
  cluster.put(pod)
  let t = now + 500
  for (const c of pod.spec.containers) {
    if (pulled.includes(c.image)) {
      event(
        cluster,
        pod,
        c.name,
        'Normal',
        'Pulled',
        `Container image "${c.image}" already present on machine`,
      )
    } else {
      event(cluster, pod, c.name, 'Normal', 'Pulling', `Pulling image "${c.image}"`)
      const ms = 1200 + sim.rng.int(2400)
      t += ms
      pulled.push(c.image)
      // The Pulled event is recorded when the wakeup fires; the size is a stable fake per image.
      const size = 20_000_000 + (parseInt(digestOf(c.image).slice(0, 6), 16) % 180_000_000)
      schedule(sim, t, {
        cluster: cluster.name,
        uid: pod.metadata.uid,
        container: c.name,
        action: 'pulled',
        life: 0,
        ms,
        size,
      })
    }
    schedule(sim, t + 300, {
      cluster: cluster.name,
      uid: pod.metadata.uid,
      container: c.name,
      action: 'started',
      life: 0,
    })
  }
}

/** A container (re)starts running: schedule its exit, probes and readiness. */
function startContainer(sim: Simulator, cluster: Cluster, pod: Pod, cs: ContainerStatus) {
  const now = sim.clock.iso()
  const spec = pod.spec.containers.find((c) => c.name === cs.name)
  cs.state = { running: { startedAt: now } }
  cs.started = true
  cs.imageID = imageId(cs.image)
  cs.containerID = `containerd://${digestOf(`${pod.metadata.uid}/${cs.name}/${String(cs.restartCount)}`)}`
  event(cluster, pod, cs.name, 'Normal', 'Created', `Created container: ${cs.name}`)
  event(cluster, pod, cs.name, 'Normal', 'Started', `Started container ${cs.name}`)
  const b = behaviourOf(sim, pod, cs.name)
  const base = {
    cluster: cluster.name,
    uid: pod.metadata.uid,
    container: cs.name,
    life: cs.restartCount,
  }
  const t = sim.clock.now
  if (b.exitAfterMs !== undefined) schedule(sim, t + b.exitAfterMs, { ...base, action: 'exit' })
  const rp = spec?.readinessProbe
  if (!rp) cs.ready = b.readiness !== 'fail'
  else
    schedule(sim, t + probeDelay(rp) + 1000, {
      ...base,
      action: b.readiness === 'fail' ? 'unready' : 'ready',
    })
  const lp = spec?.livenessProbe
  if (lp && b.liveness === 'fail')
    schedule(
      sim,
      t + probeDelay(lp) + probePeriod(lp) * (lp.failureThreshold ?? DEFAULT_FAILURE_THRESHOLD),
      { ...base, action: 'liveness' },
    )
  pod.status.conditions = (pod.status.conditions ?? []).map((c) =>
    c.type === 'PodReadyToStartContainers' && c.status !== 'True'
      ? condition(c.type, true, now, { lastProbeTime: null })
      : c,
  )
}

/** A container stopped: record it, and restart it after the backoff. */
function containerExited(
  sim: Simulator,
  cluster: Cluster,
  pod: Pod,
  cs: ContainerStatus,
  exitCode: number,
  reason: string,
) {
  const now = sim.clock.iso()
  const started = cs.state.running?.startedAt ?? now
  const ranMs = Date.parse(now) - Date.parse(started)
  cs.lastState = { terminated: { exitCode, reason, startedAt: started, finishedAt: now } }
  cs.ready = false
  cs.started = false
  const key = `${pod.metadata.uid}/${cs.name}`
  const st = kstate(sim)
  if (ranMs >= BACKOFF_RESET_MS) st.backoff[key] = 0
  const n = st.backoff[key] ?? 0
  const delay = backoffMs(n)
  st.backoff[key] = n + 1
  cs.state = {
    waiting: {
      reason: 'CrashLoopBackOff',
      message: `back-off ${formatGoDuration(delay)} restarting failed container=${cs.name} pod=${pod.metadata.name}_${pod.metadata.namespace ?? 'default'}(${pod.metadata.uid})`,
    },
  }
  event(
    cluster,
    pod,
    cs.name,
    'Warning',
    'BackOff',
    `Back-off restarting failed container ${cs.name} in pod ${pod.metadata.name}_${pod.metadata.namespace ?? 'default'}(${pod.metadata.uid})`,
  )
  schedule(sim, sim.clock.now + delay, {
    cluster: cluster.name,
    uid: pod.metadata.uid,
    container: cs.name,
    action: 'restart',
    life: cs.restartCount,
  })
}

/** Go's time.Duration formatting for whole seconds and minutes: "10s", "1m20s", "5m0s". */
export function formatGoDuration(ms: number): string {
  const s = Math.round(ms / 1000)
  if (s < 60) return `${String(s)}s`
  return `${String(Math.floor(s / 60))}m${String(s % 60)}s`
}

function wake(sim: Simulator, payload: unknown) {
  const w = payload as Wake
  const cluster = sim.clusterByName(w.cluster)
  const pod = cluster && findPod(cluster, w.uid)
  if (!cluster || !pod) return
  if (w.action === 'removed') {
    cluster.delete('Pod', pod.metadata.namespace, pod.metadata.name)
    return
  }
  if (pod.metadata.deletionTimestamp) return
  const cs = pod.status.containerStatuses?.find((c) => c.name === w.container)
  if (!cs || (w.life !== undefined && w.life !== cs.restartCount)) return
  const spec = pod.spec.containers.find((c) => c.name === cs.name)
  switch (w.action) {
    case 'pulled': {
      const ms = Number((w as Record<string, unknown>).ms ?? 0)
      const size = Number((w as Record<string, unknown>).size ?? 0)
      const secs = `${(ms / 1000).toFixed(3)}s`
      event(
        cluster,
        pod,
        cs.name,
        'Normal',
        'Pulled',
        `Successfully pulled image "${cs.image}" in ${secs} (${secs} including waiting). Image size: ${String(size)} bytes.`,
      )
      break
    }
    case 'started':
      if (!cs.state.waiting || cs.state.waiting.reason !== 'ContainerCreating') return
      startContainer(sim, cluster, pod, cs)
      break
    case 'ready':
      if (!cs.state.running) return
      cs.ready = true
      break
    case 'unready': {
      if (!cs.state.running) return
      cs.ready = false
      const rp = spec?.readinessProbe
      if (rp) {
        event(
          cluster,
          pod,
          cs.name,
          'Warning',
          'Unhealthy',
          `Readiness probe failed: ${probeTarget(rp)}`,
        )
        schedule(sim, sim.clock.now + probePeriod(rp), { ...w, action: 'unready' })
      }
      break
    }
    case 'exit': {
      if (!cs.state.running) return
      const b = behaviourOf(sim, pod, cs.name)
      const reason = b.reason ?? 'Error'
      containerExited(
        sim,
        cluster,
        pod,
        cs,
        b.exitCode ?? (reason === 'OOMKilled' ? 137 : reason === 'Completed' ? 0 : 1),
        reason,
      )
      break
    }
    case 'liveness': {
      if (!cs.state.running) return
      const lp = spec?.livenessProbe
      if (lp)
        event(
          cluster,
          pod,
          cs.name,
          'Warning',
          'Unhealthy',
          `Liveness probe failed: ${probeTarget(lp).replace('503', '500')}`,
        )
      event(
        cluster,
        pod,
        cs.name,
        'Normal',
        'Killing',
        `Container ${cs.name} failed liveness probe, will be restarted`,
      )
      containerExited(sim, cluster, pod, cs, 137, 'Error')
      break
    }
    case 'restart':
      if (!cs.state.waiting) return
      cs.restartCount += 1
      event(
        cluster,
        pod,
        cs.name,
        'Normal',
        'Pulled',
        `Container image "${cs.image}" already present on machine`,
      )
      startContainer(sim, cluster, pod, cs)
      break
  }
  refreshPod(sim, pod)
  cluster.put(pod)
}

/**
 * Pods that were already crash-looping when the scenario started keep doing what their last
 * termination says, until they're replaced.
 */
function adoptCrashLoop(sim: Simulator, cluster: Cluster, pod: Pod) {
  for (const cs of pod.status.containerStatuses ?? []) {
    const last = cs.lastState.terminated
    if (cs.state.waiting?.reason !== 'CrashLoopBackOff' || !last) continue
    const ran =
      last.startedAt && last.finishedAt
        ? Date.parse(last.finishedAt) - Date.parse(last.startedAt)
        : 2000
    setPodBehaviour(sim, pod.metadata.uid, cs.name, {
      exitAfterMs: Math.max(500, ran),
      exitCode: last.exitCode,
      reason: last.reason ?? 'Error',
    })
    const st = kstate(sim)
    const key = `${pod.metadata.uid}/${cs.name}`
    // Its backoff has reached the 5-minute cap by now; the next restart comes when that runs out.
    st.backoff[key] = Math.max(st.backoff[key] ?? 0, Math.min(cs.restartCount, 5))
    const finished = last.finishedAt
      ? Date.parse(last.finishedAt) - sim.clock.epochMs
      : sim.clock.now
    schedule(sim, Math.max(sim.clock.now, finished + backoffMs(Math.min(cs.restartCount, 5) - 1)), {
      cluster: cluster.name,
      uid: pod.metadata.uid,
      container: cs.name,
      action: 'restart',
      life: cs.restartCount,
    })
  }
}

export const kubelet: Controller = {
  name: 'kubelet',
  reconcile: (sim: Simulator) => {
    const st = kstate(sim)
    for (const name of sim.clusterNames) {
      const cluster = sim.clusterByName(name)
      if (!cluster) continue
      for (const pod of cluster.list('Pod')) {
        const uid = pod.metadata.uid
        if (pod.metadata.deletionTimestamp) {
          if (st.handled[`stop:${uid}`]) continue
          st.handled[`stop:${uid}`] = true
          for (const c of pod.spec.containers)
            event(cluster, pod, c.name, 'Normal', 'Killing', `Stopping container ${c.name}`)
          schedule(sim, sim.clock.now + STOP_MS, { cluster: name, uid, action: 'removed' })
          continue
        }
        if (st.handled[uid] || !pod.spec.nodeName) continue
        if (pod.status.containerStatuses?.length) {
          // Already running when the scenario began (or restored): pick up where it is.
          st.handled[uid] = true
          for (const c of pod.status.containerStatuses) {
            const pulled = (st.images[pod.spec.nodeName] ??= [])
            if (!pulled.includes(c.image)) pulled.push(c.image)
          }
          adoptCrashLoop(sim, cluster, pod)
          continue
        }
        beginStartup(sim, cluster, pod)
      }
    }
  },
  wake,
}
