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
