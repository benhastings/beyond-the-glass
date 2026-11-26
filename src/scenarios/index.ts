// Scenario timelines (YAML), validated at build time by ./vite-plugin.ts. See docs/sim/scenarios.md.
import pipelines from '@/scenarios/pipelines.yaml'
import ravenpost from '@/scenarios/ravenpost.yaml'
import stormwatch from '@/scenarios/stormwatch.yaml'
import theLongNight from '@/scenarios/the-long-night.yaml'
import triage from '@/scenarios/triage.yaml'
import type { Scenario } from '@/sim/core/scenario'
import { FRAGMENT_SCENARIO_LIST } from './fragments'

/** Every scenario, by ID. To add one: a new YAML file here, plus one line in this map. */
export const SCENARIOS: Readonly<Record<string, Scenario>> = {
  [ravenpost.id]: ravenpost,
  [stormwatch.id]: stormwatch,
  [theLongNight.id]: theLongNight,
  [triage.id]: triage,
  [pipelines.id]: pipelines,
  // Built from the GitOps fragments (E9-08), in code rather than YAML.
  ...Object.fromEntries(FRAGMENT_SCENARIO_LIST.map((s) => [s.id, s])),
}
