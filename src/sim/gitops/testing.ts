import { loadSimulation } from '../controllers/index.ts'
import { scenarioSchema, type ScenarioInput } from '../core/scenario.ts'
import { miniScenarioInput } from '../core/testing.ts'

/** A Deployment manifest for the mini cluster's `web`, as the deploy repo holds it (tests only). */
export const webManifest = (image: string, replicas = 2, extra = '') => `apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  labels: { app: web }
spec:
  replicas: ${String(replicas)}${extra}
  selector:
    matchLabels: { app: web }
  template:
    metadata:
      labels: { app: web }
    spec:
      containers:
        - name: web
          image: ${image}
`
export const configManifest =
  'apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: web-config\ndata:\n  GREETING: hello\n  MODE: calm\n'

/** The mini cluster with a deploy repo and an Argo application `shop` for it (tests only). */
export function gitopsScenario(automated?: { prune?: boolean; selfHeal?: boolean }) {
  const base = miniScenarioInput()
  const input: ScenarioInput = {
    ...base,
    gitops: {
      reconcileInterval: '+3m',
      repos: {
        'ravenpost-deploy': {
          files: {
            'shop/web.yaml': webManifest('registry.example/web:1.0'),
            'shop/config.yaml': configManifest,
            'README.md': '# deploy\n',
          },
        },
      },
      applications: [
        {
          name: 'shop',
          source: { repo: 'ravenpost-deploy', path: 'shop', targetRevision: 'main' },
          destination: { cluster: 'dev', namespace: 'shop' },
          ...(automated ? { syncPolicy: { automated } } : {}),
        },
      ],
    },
  }
  const scenario = scenarioSchema.parse(input)
  return { scenario, sim: loadSimulation(scenario) }
}

/**
 * `gitopsScenario` plus the app repo `shop-web`, whose pipeline builds registry.example/web and rewrites
 * shop/web.yaml in the deploy repo, with an automated Argo app (tests only).
 */
export function ciScenario(timeline: ScenarioInput['timeline'] = []) {
  const base = miniScenarioInput()
  const input: ScenarioInput = {
    ...base,
    timeline,
    gitops: {
      repos: {
        'shop-web': { files: { 'package.json': '{ "name": "shop-web" }\n', 'CHANGELOG.md': '' } },
        'ravenpost-deploy': {
          files: {
            'shop/web.yaml': webManifest('registry.example/web:1.0'),
            'shop/config.yaml': configManifest,
          },
        },
      },
      ci: {
        'shop-web': {
          image: 'registry.example/web',
          deploy: { repo: 'ravenpost-deploy', file: 'shop/web.yaml' },
        },
      },
      applications: [
        {
          name: 'shop',
          source: { repo: 'ravenpost-deploy', path: 'shop' },
          destination: { cluster: 'dev', namespace: 'shop' },
          syncPolicy: { automated: { prune: true, selfHeal: true } },
        },
      ],
    },
  }
  const scenario = scenarioSchema.parse(input)
  return { scenario, sim: loadSimulation(scenario) }
}

/**
 * The mini cluster with a deploy repo whose merge requests run validation (policies: no latest tag,
 * memory limits) and an automated Argo app without self-heal, so a kubectl fix stays (tests only).
 */
export function mrScenario(
  opts: { selfHeal?: boolean; timeline?: ScenarioInput['timeline'] } = {},
) {
  const selfHeal = opts.selfHeal ?? false
  const base = miniScenarioInput()
  const input: ScenarioInput = {
    ...base,
    timeline: opts.timeline ?? [],
    gitops: {
      repos: {
        'ravenpost-deploy': {
          files: {
            'shop/web.yaml': webManifest('registry.example/web:1.0'),
            'shop/config.yaml': configManifest,
          },
        },
      },
      ci: { 'ravenpost-deploy': { policies: ['no-latest-tag', 'memory-limits'] } },
      applications: [
        {
          name: 'shop',
          source: { repo: 'ravenpost-deploy', path: 'shop' },
          destination: { cluster: 'dev', namespace: 'shop' },
          syncPolicy: { automated: { prune: true, selfHeal } },
        },
      ],
    },
  }
  const scenario = scenarioSchema.parse(input)
  return { scenario, sim: loadSimulation(scenario) }
}

/** `webManifest` with a memory limit on its container (what the memory-limits policy wants). */
export const webWithLimit = (image: string, memory = '256Mi', replicas = 2) =>
  `${webManifest(image, replicas).trimEnd()}\n          resources:\n            limits:\n              memory: ${memory}\n`
