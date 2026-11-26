import { scenarioSchema, type Scenario, type ScenarioInput } from '@/sim/core/scenario'
import { composeFragments, fragment } from '@/sim/gitops/fragments'
import { FRAGMENT_SCENARIO_IDS } from './fragment-ids'
import stormwatch from '@/scenarios/stormwatch.yaml'

/**
 * Mirror Lake's GitOps situations (E9-08): the E7-06 fragments, each on its own copy of the reference
 * system, acting on the gate. Each is warmed up past the moment its trouble starts, so the learner arrives
 * to it.
 */
export const FRAGMENT_TARGET = {
  app: 'ravenpost',
  repo: 'ravenpost-deploy',
  file: 'prod/deployment-gate.yaml',
  namespace: 'ravenpost',
  deployment: 'gate',
  image: 'registry.example/ravenpost/gate',
  tag: '2.3.1',
  at: '+2m',
} as const

/** Scenario id → the fragment it plays, and how long it runs before the learner arrives. */
export const FRAGMENT_SCENARIOS: Record<
  (typeof FRAGMENT_SCENARIO_IDS)[number],
  { fragment: string; warmUp: string; params?: Record<string, unknown> }
> = {
  // Past Argo CD's first reconcile, so the app reads Synced when the learner arrives.
  'gitops-drift': { fragment: 'drift-self-heal', warmUp: '+4m' },
  'gitops-manual-sync': { fragment: 'manual-sync', warmUp: '+6m', params: { newTag: '2.3.2' } },
  'gitops-sync-failed': {
    fragment: 'sync-failed',
    warmUp: '+6m',
    // The reference system's manifests are block-style YAML, so the selector change is written that way.
    params: {
      breaking: [
        {
          from: '    matchLabels:\n      app: gate\n',
          to: '    matchLabels:\n      app: gate\n      tier: front\n',
        },
        {
          from: '  template:\n    metadata:\n      labels:\n        app: gate\n',
          to: '  template:\n    metadata:\n      labels:\n        app: gate\n        tier: front\n',
        },
      ],
    },
  },
  'gitops-bad-release': { fragment: 'bad-release', warmUp: '+13m', params: { badTag: 'v2.4.0' } },
}

function build(id: keyof typeof FRAGMENT_SCENARIOS): Scenario {
  const { fragment: name, warmUp, params } = FRAGMENT_SCENARIOS[id]
  const f = fragment(name)
  if (!f) throw new Error(`no fragment ${name}`)
  const input = composeFragments(structuredClone(stormwatch) as unknown as ScenarioInput, [
    { fragment: f, params: { ...FRAGMENT_TARGET, ...params } },
  ])
  return scenarioSchema.parse({ ...input, id, title: f.title, description: f.situation, warmUp })
}

export const FRAGMENT_SCENARIO_LIST: Scenario[] = FRAGMENT_SCENARIO_IDS.map(build)
