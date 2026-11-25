import { behaviourOf } from '../core/behaviour.ts'
import type { Simulator } from '../core/simulator.ts'
import { fnv1a32 } from '../core/rng.ts'
import type { Node, Pod } from '../core/resources.ts'

/** CPU in millicores and memory in bytes, as metrics-server reports them. */
export interface Usage {
  cpu: number
  memory: number
}

const MI = 1024 ** 2

/**
 * What a running container uses: its image behaviour's `cpuMillis`/`memoryMi` if the scenario sets them,
 * otherwise a small, stable amount derived from the image. Containers that aren't running use nothing.
 */
export function containerUsage(sim: Simulator, pod: Pod, container: string): Usage {
  const cs = pod.status.containerStatuses?.find((c) => c.name === container)
  if (!cs?.state.running) return { cpu: 0, memory: 0 }
  const b = behaviourOf(sim, pod, container)
  const h = fnv1a32(pod.spec.containers.find((c) => c.name === container)?.image ?? container)
  return { cpu: b.cpuMillis ?? 1 + (h % 7), memory: Math.round((b.memoryMi ?? 16 + (h % 64)) * MI) }
}

export function podUsage(sim: Simulator, pod: Pod): Usage {
  return pod.spec.containers
    .map((c) => containerUsage(sim, pod, c.name))
    .reduce((a, b) => ({ cpu: a.cpu + b.cpu, memory: a.memory + b.memory }), { cpu: 0, memory: 0 })
}

/** A node's use: its pods plus the kubelet, runtime and OS. */
export function nodeUsage(sim: Simulator, pods: Pod[], node: Node): Usage {
  const base = { cpu: 60 + (fnv1a32(node.metadata.name) % 40), memory: 480 * MI }
  return pods
    .filter((p) => p.spec.nodeName === node.metadata.name)
    .map((p) => podUsage(sim, p))
    .reduce((a, b) => ({ cpu: a.cpu + b.cpu, memory: a.memory + b.memory }), base)
}
