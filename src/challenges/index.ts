// Terminal challenges (YAML), validated at build time by ./vite-plugin.ts. See docs/sim/challenges.md.
import findTheFailingPod from '@/challenges/find-the-failing-pod.yaml'
import countSystemPods from '@/challenges/count-system-pods.yaml'
import podsByLabel from '@/challenges/pods-by-label.yaml'
import replaceAPod from '@/challenges/replace-a-pod.yaml'
import rollOutWeb from '@/challenges/roll-out-web.yaml'
import scaleTheWorker from '@/challenges/scale-the-worker.yaml'
import traceAService from '@/challenges/trace-a-service.yaml'
import whichNode from '@/challenges/which-node.yaml'
import readTheImage from '@/challenges/read-the-image.yaml'
import whyIsItCrashing from '@/challenges/why-is-it-crashing.yaml'
import type { Challenge } from '@/sim/challenges/schema'

/** Every challenge, by ID. To add one: a YAML file here, plus one line in this map. */
export const CHALLENGES: Readonly<Record<string, Challenge>> = {
  [findTheFailingPod.id]: findTheFailingPod,
  [whyIsItCrashing.id]: whyIsItCrashing,
  [whichNode.id]: whichNode,
  [countSystemPods.id]: countSystemPods,
  [podsByLabel.id]: podsByLabel,
  [readTheImage.id]: readTheImage,
  [replaceAPod.id]: replaceAPod,
  [scaleTheWorker.id]: scaleTheWorker,
  [rollOutWeb.id]: rollOutWeb,
  [traceAService.id]: traceAService,
}
