import type { SimClock } from '../core/clock.ts'
import type { Pod } from '../core/resources.ts'
import { humanDuration } from './format.ts'

/**
 * The READY, STATUS and RESTARTS columns of `kubectl get pods`, computed the way kubectl's printPod does
 * (k8s.io/kubernetes/pkg/printers/internalversion), including "9 (2m ago)" restarts.
 */
export function podColumns(
  pod: Pod,
  clock: SimClock,
): { ready: string; status: string; restarts: string } {
  const statuses = pod.status.containerStatuses ?? []
  const total = pod.spec.containers.length
  let reason: string = pod.status.reason ?? pod.status.phase
  let readyCount = 0
  let restarts = 0
  let lastRestart: number | undefined
  let hasRunning = false
  for (let i = statuses.length - 1; i >= 0; i--) {
    const c = statuses[i]
    if (!c) continue
    restarts += c.restartCount
    const finished = c.lastState.terminated?.finishedAt
    if (finished) {
      const t = Date.parse(finished) - clock.epochMs
      if (lastRestart === undefined || t > lastRestart) lastRestart = t
    }
    const w = c.state.waiting
    const term = c.state.terminated
    if (w?.reason) reason = w.reason
    else if (term?.reason) reason = term.reason
    else if (term)
      reason = term.signal ? `Signal:${String(term.signal)}` : `ExitCode:${String(term.exitCode)}`
    else if (c.ready && c.state.running) {
      hasRunning = true
      readyCount++
    }
  }
  if (reason === 'Completed' && hasRunning) {
    reason = pod.status.conditions?.some((c) => c.type === 'Ready' && c.status === 'True')
      ? 'Running'
      : 'NotReady'
  }
  if (pod.metadata.deletionTimestamp)
    reason = pod.status.reason === 'NodeLost' ? 'Unknown' : 'Terminating'
  return {
    ready: `${String(readyCount)}/${String(total)}`,
    status: reason,
    restarts:
      lastRestart !== undefined && restarts > 0
        ? `${String(restarts)} (${humanDuration(clock.now - lastRestart)} ago)`
        : String(restarts),
  }
}

export function age(created: string, clock: SimClock): string {
  return humanDuration(clock.now - (Date.parse(created) - clock.epochMs))
}
