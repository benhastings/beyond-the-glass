// Framework-free simulator core (E6-01). See docs/plan/ROADMAP.md §4 and ADR-004.
export * from './resources.ts'
export { Cluster, isPodReady, type ClusterData, type ListOptions } from './cluster.ts'
export { SimClock, DEFAULT_START } from './clock.ts'
export { parseDuration, isDuration } from './duration.ts'
export { Rng, fnv1a32 } from './rng.ts'
export {
  SAFE_ALPHABET,
  safeEncode,
  podTemplateHash,
  nameSuffix,
  uid,
  digestOf,
  imageId,
  stableStringify,
} from './names.ts'
export { matchesSelector, matchesMap } from './selectors.ts'
export { createRunningPod, runningStatus, ownerRef, condition, nextPodIP } from './pods.ts'
export {
  refreshDeploymentStatus,
  refreshReplicaSetStatus,
  ownedPods,
  ownedReplicaSets,
  scaledValue,
} from './workloads.ts'
export {
  scenarioSchema,
  type Scenario,
  type ScenarioInput,
  type ScenarioCluster,
  type Manifest,
  type TimelineEntry,
} from './scenario.ts'
export {
  TIMELINE_EVENTS,
  timelineEvent,
  defineTimelineEvent,
  type TimelineEventDef,
} from './timeline/index.ts'
export {
  Simulator,
  SNAPSHOT_VERSION,
  type Controller,
  type SimOptions,
  type SimSnapshot,
  type Traffic,
  type Wakeup,
} from './simulator.ts'
