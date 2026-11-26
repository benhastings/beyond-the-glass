// Scenario timelines (YAML), validated at build time by ./vite-plugin.ts. See docs/sim/scenarios.md.
import pipelines from '@/scenarios/pipelines.yaml'
import ravenpost from '@/scenarios/ravenpost.yaml'
import signals from '@/scenarios/signals.yaml'
import slowLedger from '@/scenarios/slow-ledger.yaml'
import brokenTraces from '@/scenarios/broken-traces.yaml'
import stormwatch from '@/scenarios/stormwatch.yaml'
import triage from '@/scenarios/triage.yaml'
import type { Scenario } from '@/sim/core/scenario'
import { FRAGMENT_SCENARIO_LIST } from './fragments'

/** Every scenario, by ID. To add one: a new YAML file here, plus one line in this map. */
export const SCENARIOS: Readonly<Record<string, Scenario>> = {
  [ravenpost.id]: ravenpost,
  [stormwatch.id]: stormwatch,
  [triage.id]: triage,
  [pipelines.id]: pipelines,
  [signals.id]: signals,
  [slowLedger.id]: slowLedger,
  [brokenTraces.id]: brokenTraces,
  // Built from the GitOps fragments (E9-08), in code rather than YAML.
  ...Object.fromEntries(FRAGMENT_SCENARIO_LIST.map((s) => [s.id, s])),
}
