import { describe, expect, it } from 'vitest'
import { acTest } from '@/test/ac'
import { scenarioSchema, type ScenarioInput } from './scenario'
import { miniScenarioInput } from './testing'
import { TIMELINE_EVENTS } from './timeline'

function problems(input: unknown): string[] {
  const r = scenarioSchema.safeParse(input)
  return r.success ? [] : r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)
}

function withCluster(patch: Record<string, unknown>): ScenarioInput {
  const base = miniScenarioInput()
  return {
    ...base,
    clusters: [{ ...base.clusters[0], ...patch } as ScenarioInput['clusters'][number]],
  }
}

describe('scenario schema', () => {
  it('accepts the mini scenario and fills defaults', () => {
    const s = scenarioSchema.parse(miniScenarioInput())
    expect(s.timeline).toEqual([])
    expect(s.clusters[0]?.kubernetesVersion).toBe('v1.34.0')
    expect(s.clusters[0]?.nodes[1]).toMatchObject({
      role: 'worker',
      cpu: '4',
      memory: '8Gi',
      pods: 110,
    })
  })

  acTest('E6-01.AC3', 'rejects schema violations, naming the field', () => {
    expect(problems({ ...miniScenarioInput(), id: 'Not A Slug' })).toEqual([
      expect.stringMatching(/^id: must be a lowercase DNS-1123 name/),
    ])
    expect(problems({ ...miniScenarioInput(), surprise: true })[0]).toMatch(/surprise/)
    const typo = withCluster({
      resources: [
        {
          apiVersion: 'v1',
          kind: 'ConfigMap',
          metadata: { name: 'x', namspace: 'shop' },
          data: {},
        },
      ],
    })
    expect(problems(typo)[0]).toMatch(/^clusters\.0\.resources\.0\.metadata: .*namspace/)
  })

  acTest('E6-01.AC3', 'rejects broken references between parts of a scenario', () => {
    const base = miniScenarioInput()
    expect(problems({ ...base, currentContext: 'prod' })).toEqual([
      'currentContext: no context named "prod"',
    ])
    expect(problems({ ...base, contexts: [{ name: 'dev', cluster: 'nope', user: 'u' }] })).toEqual([
      'contexts.0.cluster: no cluster named "nope"',
    ])
    expect(
      problems(
        withCluster({ podOverrides: [{ namespace: 'shop', deployment: 'api', containers: {} }] }),
      ),
    ).toEqual(['clusters.0.podOverrides.0.deployment: no Deployment shop/api in this cluster'])
    expect(
      problems(
        withCluster({
          podOverrides: [
            { namespace: 'shop', deployment: 'web', replica: 2, containers: { sidecar: {} } },
          ],
        }),
      ),
    ).toEqual([
      'clusters.0.podOverrides.0.replica: web has 2 replicas',
      'clusters.0.podOverrides.0.containers.sidecar: web has no container "sidecar"',
    ])
    expect(problems(withCluster({ nodes: [{ name: 'only-cp', role: 'control-plane' }] }))).toEqual([
      'clusters.0.nodes: needs at least one worker node',
    ])
  })

  acTest('E6-01.AC3', 'rejects duplicates and a selector that misses its template', () => {
    const base = miniScenarioInput()
    const c = base.clusters[0]
    if (!c) throw new Error('fixture')
    const dupes = problems({
      ...base,
      clusters: [c, c],
      contexts: [base.contexts[0], base.contexts[0]],
    })
    expect(dupes).toContain('clusters: duplicate cluster "dev"')
    expect(dupes).toContain('contexts: duplicate context "dev"')
    const twice = withCluster({
      resources: [c.resources?.[0], c.resources?.[0]],
      nodes: [{ name: 'a' }, { name: 'a' }],
    })
    expect(problems(twice)).toEqual([
      'clusters.0.resources: duplicate resource ConfigMap/shop/web-config',
      'clusters.0.nodes: duplicate node "a"',
    ])
    const deployment = {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: { name: 'x' },
      spec: {
        selector: { matchLabels: { app: 'x' } },
        template: {
          metadata: { labels: { app: 'y' } },
          spec: { containers: [{ name: 'x', image: 'x:1' }] },
        },
      },
    }
    expect(problems(withCluster({ resources: [deployment] }))).toEqual([
      'clusters.0.resources.0.spec.selector: `selector` does not match template `labels`',
    ])
  })

  acTest('E6-01.AC3', 'validates timeline entries against their event type and the cluster', () => {
    const t = (timeline: unknown[]) => problems({ ...miniScenarioInput(), timeline })
    expect(t([{ at: '+1m', type: 'explode' }])[0]).toMatch(
      /^timeline\.0\.type: unknown timeline event "explode" \(known: setImage/,
    )
    expect(t([{ at: '-1m', type: 'load', namespace: 'shop', service: 'web', rps: 1 }])[0]).toMatch(
      /^timeline\.0\.at: /,
    )
    expect(t([{ at: 'soon', type: 'load', namespace: 'shop', service: 'web', rps: 1 }])[0]).toMatch(
      /^timeline\.0\.at: /,
    )
    expect(
      t([{ at: '+1m', type: 'load', cluster: 'prod', namespace: 'shop', service: 'web', rps: 1 }]),
    ).toEqual(['timeline.0.cluster: no cluster named "prod"'])
    expect(t([{ at: '+1m', type: 'load', namespace: 'shop', service: 'web' }])[0]).toMatch(
      /^timeline\.0\.rps: /,
    )
    expect(t([{ at: '+1m', type: 'load', namespace: 'shop', service: 'api', rps: 1 }])).toEqual([
      'timeline.0.service: no Service shop/api in this cluster',
    ])
    expect(
      t([
        {
          at: '+1m',
          type: 'setImage',
          namespace: 'shop',
          deployment: 'web',
          container: 'app',
          image: 'x:2',
        },
      ]),
    ).toEqual(['timeline.0.container: web has no container "app"'])
    expect(
      t([
        {
          at: '+1m',
          type: 'setMemoryLimit',
          namespace: 'shop',
          deployment: 'api',
          container: 'web',
          limit: '1Gi',
        },
      ]),
    ).toEqual(['timeline.0.deployment: no Deployment shop/api in this cluster'])
    expect(
      t([
        {
          at: '+1m',
          type: 'setMemoryLimit',
          namespace: 'shop',
          deployment: 'web',
          container: 'web',
          limit: 'lots',
        },
      ])[0],
    ).toMatch(/^timeline\.0\.limit: must be a memory quantity/)
    expect(
      t([
        { at: '+1m', type: 'deleteConfigKey', namespace: 'shop', configMap: 'nope', key: 'MODE' },
      ]),
    ).toEqual(['timeline.0.configMap: no ConfigMap shop/nope in this cluster'])
    expect(
      t([
        {
          at: '+1m',
          type: 'deleteConfigKey',
          namespace: 'shop',
          configMap: 'web-config',
          key: 'NOPE',
        },
      ]),
    ).toEqual(['timeline.0.key: ConfigMap web-config has no key "NOPE"'])
  })

  it('registers every timeline event type once', () => {
    const types = TIMELINE_EVENTS.map((e) => e.type)
    expect(new Set(types).size).toBe(types.length)
    expect(types).toEqual([
      'setImage',
      'deleteConfigKey',
      'setMemoryLimit',
      'injectLatency',
      'load',
      'setResources',
      'setReadinessPath',
      'setServiceSelector',
      'pipeline',
      'ciFailure',
      'gitCommit',
      'injectErrors',
      'nodeWarning',
    ])
  })
})
