import { scenarioSchema, type Scenario, type ScenarioInput } from './scenario.ts'

/**
 * A small valid scenario for tests: one cluster (`dev`), two workers, a ConfigMap, a Secret, a
 * two-replica Deployment `shop/web` with a Service, and whatever `patch` overrides.
 */
export function miniScenarioInput(patch: Partial<ScenarioInput> = {}): ScenarioInput {
  return {
    id: 'mini',
    title: 'Mini',
    seed: 5,
    currentContext: 'dev',
    contexts: [{ name: 'dev', cluster: 'dev', user: 'dev-admin', namespace: 'shop' }],
    clusters: [
      {
        name: 'dev',
        server: 'https://dev.example:6443',
        system: 'none',
        nodes: [{ name: 'dev-cp', role: 'control-plane' }, { name: 'dev-w1' }, { name: 'dev-w2' }],
        resources: [
          {
            apiVersion: 'v1',
            kind: 'ConfigMap',
            metadata: { name: 'web-config', namespace: 'shop' },
            data: { GREETING: 'hello', MODE: 'calm' },
          },
          {
            apiVersion: 'v1',
            kind: 'Secret',
            metadata: { name: 'web-secret', namespace: 'shop' },
            data: { token: 'c2VjcmV0' },
            stringData: { password: 'hunter2!' },
          },
          {
            apiVersion: 'apps/v1',
            kind: 'Deployment',
            metadata: { name: 'web', namespace: 'shop', labels: { app: 'web' } },
            spec: {
              replicas: 2,
              selector: { matchLabels: { app: 'web' } },
              template: {
                metadata: { labels: { app: 'web' } },
                spec: {
                  containers: [
                    {
                      name: 'web',
                      image: 'registry.example/web:1.0',
                      resources: {
                        requests: { cpu: '100m', memory: '64Mi' },
                        limits: { cpu: '100m', memory: '64Mi' },
                      },
                    },
                  ],
                },
              },
            },
          },
          {
            apiVersion: 'v1',
            kind: 'Service',
            metadata: { name: 'web', namespace: 'shop' },
            spec: { selector: { app: 'web' }, ports: [{ port: 80, targetPort: 8080 }] },
          },
        ],
      },
    ],
    ...patch,
  }
}

export function miniScenario(patch: Partial<ScenarioInput> = {}): Scenario {
  return scenarioSchema.parse(miniScenarioInput(patch))
}
