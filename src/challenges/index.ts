// Terminal challenges (YAML), validated at build time by ./vite-plugin.ts. See docs/sim/challenges.md.
import findTheFailingPod from '@/challenges/find-the-failing-pod.yaml'
import countSystemPods from '@/challenges/count-system-pods.yaml'
import podsByLabel from '@/challenges/pods-by-label.yaml'
import whichNode from '@/challenges/which-node.yaml'
import mostRestarts from '@/challenges/most-restarts.yaml'
import rightContext from '@/challenges/right-context.yaml'
import whyIsItCrashing from '@/challenges/why-is-it-crashing.yaml'
import type { Challenge } from '@/sim/challenges/schema'

/** Every challenge, by ID. To add one: a YAML file here, plus one line in this map. */
export const CHALLENGES: Readonly<Record<string, Challenge>> = {
  [findTheFailingPod.id]: findTheFailingPod,
  [whyIsItCrashing.id]: whyIsItCrashing,
  [whichNode.id]: whichNode,
  [countSystemPods.id]: countSystemPods,
  [podsByLabel.id]: podsByLabel,
  [rightContext.id]: rightContext,
  [mostRestarts.id]: mostRestarts,
}
