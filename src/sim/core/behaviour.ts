import { z } from 'zod'
import type { Simulator } from './simulator.ts'
import type { Pod } from './resources.ts'

/**
 * How a container behaves once started. Healthy by default. Scenarios declare it per image (`images:`),
 * timeline events set it (E6-03), and the kubelet reads it. Plain JSON, kept in snapshots.
 */
export const behaviourSchema = z.strictObject({
  /** The process exits this long after starting. */
  exitAfterMs: z.number().int().nonnegative().optional(),
  /** Exit code when it exits (default 1, or 137 for OOMKilled). */
  exitCode: z.number().int().optional(),
  /** Termination reason: "Error" (default), "OOMKilled" or "Completed". */
  reason: z.string().optional(),
  /** Readiness and liveness probe results (default "pass"). */
  readiness: z.enum(['pass', 'fail']).optional(),
  liveness: z.enum(['pass', 'fail']).optional(),
  /** The HTTP paths the app actually serves; a probe on any other path gets a 404. */
  healthPaths: z.array(z.string()).optional(),
  /** Pulling the image: "notFound" (a tag that doesn't exist) or "unauthorized". */
  pull: z.enum(['ok', 'notFound', 'unauthorized']).optional(),
  /** Steady memory use in MiB: above the container's limit, it's OOMKilled. */
  memoryMi: z.number().nonnegative().optional(),
  /** Steady CPU use in millicores (for `kubectl top`). */
  cpuMillis: z.number().nonnegative().optional(),
  /** Log lines the container writes when it starts (and, for a crash, just before it exits). */
  log: z.array(z.string()).optional(),
})

export type ContainerBehaviour = z.infer<typeof behaviourSchema>

interface BehaviourState extends Record<string, unknown> {
  /** By image reference. */
  byImage: Record<string, ContainerBehaviour>
  /** By `<pod uid>/<container>`: one pod only. */
  byPod: Record<string, ContainerBehaviour>
}

const state = (sim: Simulator) =>
  sim.state<BehaviourState>('behaviours', () => ({ byImage: {}, byPod: {} }))

/** How containers running `image` behave (no per-pod override). */
export function imageBehaviour(sim: Simulator, image: string): ContainerBehaviour {
  return state(sim).byImage[image] ?? {}
}

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
