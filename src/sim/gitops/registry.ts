import { fnv1a32 } from '../core/rng.ts'
import type { Simulator } from '../core/simulator.ts'

/** The image registry (E7-01): tags pipelines push, each with a digest. In the simulation's state. */
export interface ImageTag {
  image: string
  tag: string
  digest: string
  /** Sim time (ms). */
  pushedAt: number
  /** The commit it was built from, if a pipeline built it. */
  sha?: string
}

const state = (sim: Simulator) => sim.state<{ tags: ImageTag[] }>('registry', () => ({ tags: [] }))

export function pushImage(sim: Simulator, image: string, tag: string, sha?: string): ImageTag {
  const digest = `sha256:${Array.from({ length: 8 }, (_, i) =>
    fnv1a32(`${String(i)}:${image}:${tag}:${sha ?? ''}`)
      .toString(16)
      .padStart(8, '0'),
  ).join('')}`
  const t: ImageTag = { image, tag, digest, pushedAt: sim.now, ...(sha ? { sha } : {}) }
  const st = state(sim)
  st.tags = [...st.tags.filter((x) => !(x.image === image && x.tag === tag)), t]
  return t
}

export function imageTags(sim: Simulator, image?: string): ImageTag[] {
  return state(sim).tags.filter((t) => image === undefined || t.image === image)
}

/** Whether `image:tag` exists in the registry. */
export function hasImage(sim: Simulator, ref: string): boolean {
  const i = ref.lastIndexOf(':')
  return (
    i > 0 && state(sim).tags.some((t) => t.image === ref.slice(0, i) && t.tag === ref.slice(i + 1))
  )
}
