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
import makeItStick from '@/challenges/make-it-stick.yaml'
import syncTheRelease from '@/challenges/sync-the-release.yaml'
import readTheFailedSync from '@/challenges/read-the-failed-sync.yaml'
import rollBackTheRelease from '@/challenges/roll-back-the-release.yaml'
import mostRestarts from '@/challenges/most-restarts.yaml'
import readThePipelines from '@/challenges/read-the-pipelines.yaml'
import rightContext from '@/challenges/right-context.yaml'
import triageCrashloop from '@/challenges/triage-crashloop.yaml'
import triageImagepull from '@/challenges/triage-imagepull.yaml'
import triageConfig from '@/challenges/triage-config.yaml'
import triageOom from '@/challenges/triage-oom.yaml'
import triagePending from '@/challenges/triage-pending.yaml'
import triageNotReady from '@/challenges/triage-not-ready.yaml'
import whichTagShipped from '@/challenges/which-tag-shipped.yaml'
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
  [rightContext.id]: rightContext,
  [mostRestarts.id]: mostRestarts,
  [triageCrashloop.id]: triageCrashloop,
  [triageImagepull.id]: triageImagepull,
  [triageConfig.id]: triageConfig,
  [triageOom.id]: triageOom,
  [triagePending.id]: triagePending,
  [triageNotReady.id]: triageNotReady,
  [whichTagShipped.id]: whichTagShipped,
  [readThePipelines.id]: readThePipelines,
  [makeItStick.id]: makeItStick,
  [syncTheRelease.id]: syncTheRelease,
  [readTheFailedSync.id]: readTheFailedSync,
  [rollBackTheRelease.id]: rollBackTheRelease,
}
