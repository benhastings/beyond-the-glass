import { loadSimulation } from '../controllers/index.ts'
import { scenarioSchema, type ScenarioInput } from '../core/scenario.ts'

type Resource = NonNullable<ScenarioInput['clusters'][number]['resources']>[number]

const deployment = (
  name: string,
  replicas: number,
  memory: string,
  port: number,
  recreate = false,
): Resource => ({
  apiVersion: 'apps/v1',
  kind: 'Deployment',
  metadata: { name, namespace: 'ravenpost', labels: { app: name } },
  spec: {
    replicas,
    ...(recreate ? { strategy: { type: 'Recreate' } } : {}),
    selector: { matchLabels: { app: name } },
    template: {
      metadata: { labels: { app: name } },
      spec: {
        containers: [
          {
            name,
            image: `registry.example/ravenpost/${name}:1.0`,
            ports: [{ containerPort: port }],
            resources: { requests: { cpu: '50m', memory: '64Mi' }, limits: { memory } },
          },
        ],
      },
    },
  },
})
const service = (name: string, port: number): Resource => ({
  apiVersion: 'v1',
  kind: 'Service',
  metadata: { name, namespace: 'ravenpost' },
  spec: { selector: { app: name }, ports: [{ port, targetPort: port }] },
})

/**
 * Six services with a request topology (tests only): gate → api → ledger → postgres, api → queue, and the
 * scribe worker writing to postgres. `ledger` runs one replica with the Recreate strategy, so a fault in
 * it takes it away entirely.
 */
export function telemetryScenarioInput(timeline: ScenarioInput['timeline'] = []): ScenarioInput {
  const svcs: [string, number, string, number, boolean][] = [
    ['gate', 2, '256Mi', 8080, false],
    ['api', 2, '256Mi', 8080, false],
    ['ledger', 1, '256Mi', 8080, true],
    ['postgres', 1, '1Gi', 5432, false],
    ['queue', 1, '256Mi', 6379, false],
    ['scribe', 1, '256Mi', 8080, false],
  ]
  return {
    id: 'telemetry-six',
    title: 'Six services',
    seed: 7,
    startTime: '2026-03-14T20:00:00Z',
    currentContext: 'prod',
    contexts: [{ name: 'prod', cluster: 'prod', user: 'oncall', namespace: 'ravenpost' }],
    clusters: [
      {
        name: 'prod',
        server: 'https://prod.example:6443',
        system: 'none',
        nodes: [
          { name: 'prod-cp', role: 'control-plane' },
          { name: 'prod-w1' },
          { name: 'prod-w2' },
          { name: 'prod-w3' },
        ],
        resources: svcs.flatMap(([n, r, m, p, rc]) => [deployment(n, r, m, p, rc), service(n, p)]),
      },
    ],
    images: Object.fromEntries(
      svcs.map(([n]) => [
        `registry.example/ravenpost/${n}:1.0`,
        { memoryMi: n === 'postgres' ? 400 : 180 },
      ]),
    ),
    timeline,
    telemetry: {
      services: [
        {
          name: 'gate',
          namespace: 'ravenpost',
          calls: ['api'],
          latencyMs: 8,
          rps: 40,
          operation: 'GET /messages',
        },
        {
          name: 'api',
          namespace: 'ravenpost',
          calls: ['ledger', 'queue'],
          latencyMs: 25,
          operation: 'GET /messages',
        },
        {
          name: 'ledger',
          namespace: 'ravenpost',
          calls: ['postgres'],
          latencyMs: 15,
          operation: 'GET /ledger',
        },
        {
          name: 'postgres',
          namespace: 'ravenpost',
          kind: 'db',
          latencyMs: 6,
          operation: 'SELECT messages',
        },
        {
          name: 'queue',
          namespace: 'ravenpost',
          kind: 'queue',
          latencyMs: 2,
          operation: 'publish messages',
        },
        {
          name: 'scribe',
          namespace: 'ravenpost',
          kind: 'worker',
          calls: ['postgres'],
          latencyMs: 40,
          rps: 5,
          operation: 'process message',
        },
      ],
    },
  }
}

export function telemetryScenario(timeline: ScenarioInput['timeline'] = []) {
  const scenario = scenarioSchema.parse(telemetryScenarioInput(timeline))
  return { scenario, sim: loadSimulation(scenario) }
}

/**
 * The six services, with the gate deployed by Argo CD from a deploy repo, and a release of the gate at
 * +30m (tests and demos only): telemetry and deploys on one timeline.
 */
export function telemetryGitopsScenarioInput(
  timeline: ScenarioInput['timeline'] = [],
): ScenarioInput {
  const input = telemetryScenarioInput(timeline)
  const gate = input.clusters[0]?.resources?.find(
    (r) => r.kind === 'Deployment' && r.metadata.name === 'gate',
  )
  return {
    ...input,
    timeline: [
      ...(input.timeline ?? []),
      {
        at: '+30m',
        type: 'gitCommit',
        repo: 'ravenpost-deploy',
        message: 'Release gate 1.1',
        replace: [{ file: 'ravenpost/gate.yaml', from: 'gate:1.0', to: 'gate:1.1' }],
      },
    ],
    images: { ...input.images, 'registry.example/ravenpost/gate:1.1': { memoryMi: 180 } },
    gitops: {
      repos: {
        'ravenpost-deploy': {
          files: { 'ravenpost/gate.yaml': `${JSON.stringify(gate, null, 2)}\n` },
        },
      },
      applications: [
        {
          name: 'gate',
          source: { repo: 'ravenpost-deploy', path: 'ravenpost' },
          destination: { cluster: 'prod', namespace: 'ravenpost' },
          syncPolicy: { automated: { prune: false, selfHeal: true } },
        },
      ],
    },
  }
}

export function telemetryGitopsScenario(timeline: ScenarioInput['timeline'] = []) {
  const scenario = scenarioSchema.parse(telemetryGitopsScenarioInput(timeline))
  return { scenario, sim: loadSimulation(scenario) }
}
