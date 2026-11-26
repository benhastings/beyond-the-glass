// Terminal challenges (YAML), validated at build time by ./vite-plugin.ts. See docs/sim/challenges.md.
import findTheFailingPod from '@/challenges/find-the-failing-pod.yaml'
import countSystemPods from '@/challenges/count-system-pods.yaml'
import podsByLabel from '@/challenges/pods-by-label.yaml'
import whichNode from '@/challenges/which-node.yaml'
import mostRestarts from '@/challenges/most-restarts.yaml'
import rightContext from '@/challenges/right-context.yaml'
import triageCrashloop from '@/challenges/triage-crashloop.yaml'
import triageImagepull from '@/challenges/triage-imagepull.yaml'
import triageConfig from '@/challenges/triage-config.yaml'
import triageOom from '@/challenges/triage-oom.yaml'
import triagePending from '@/challenges/triage-pending.yaml'
import triageNotReady from '@/challenges/triage-not-ready.yaml'
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
  [triageCrashloop.id]: triageCrashloop,
  [triageImagepull.id]: triageImagepull,
  [triageConfig.id]: triageConfig,
  [triageOom.id]: triageOom,
  [triagePending.id]: triagePending,
  [triageNotReady.id]: triageNotReady,
}
