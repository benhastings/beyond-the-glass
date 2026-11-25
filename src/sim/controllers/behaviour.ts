import type { Simulator } from '../core/simulator.ts'
import type { Pod } from '../core/resources.ts'

/**
 * How a container behaves once started. Healthy by default. Fault injectors (E6-03) and tests set these;
 * the kubelet reads them. Plain JSON, kept in snapshots.
 */
export interface ContainerBehaviour {
  /** The process exits this long after starting. */
  exitAfterMs?: number
  /** Exit code when it exits (default 1). */
  exitCode?: number
  /** Termination reason: "Error" (default), "OOMKilled" or "Completed". */
  reason?: string
  /** Readiness probe result (default "pass"). */
  readiness?: 'pass' | 'fail'
  /** Liveness probe result (default "pass"). */
  liveness?: 'pass' | 'fail'
}

interface BehaviourState extends Record<string, unknown> {
  /** By image reference. */
  byImage: Record<string, ContainerBehaviour>
  /** By `<pod uid>/<container>`: one pod only. */
  byPod: Record<string, ContainerBehaviour>
}

const state = (sim: Simulator) =>
  sim.state<BehaviourState>('behaviours', () => ({ byImage: {}, byPod: {} }))

/** Every container running `image` (on any cluster) behaves like this. */
export function setImageBehaviour(sim: Simulator, image: string, b: ContainerBehaviour): void {
  state(sim).byImage[image] = b
}

/** One container of one pod behaves like this. */
export function setPodBehaviour(
  sim: Simulator,
  podUid: string,
  container: string,
  b: ContainerBehaviour,
): void {
  state(sim).byPod[`${podUid}/${container}`] = b
}

export function behaviourOf(sim: Simulator, pod: Pod, container: string): ContainerBehaviour {
  const s = state(sim)
  const image = pod.spec.containers.find((c) => c.name === container)?.image ?? ''
  return s.byPod[`${pod.metadata.uid}/${container}`] ?? s.byImage[image] ?? {}
}
