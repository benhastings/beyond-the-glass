import { describe, expect, it } from 'vitest'
import { auditLog } from '../core/audit'
import { scenarioSchema } from '../core/scenario'
import { miniScenarioInput } from '../core/testing'
import { DEFAULT_SYNC_MS, manageNamespace, managedBy } from './gitops'
import { loadSimulation, restoreSimulation } from './index'

const mini = () => {
  const scenario = scenarioSchema.parse(miniScenarioInput())
  const sim = loadSimulation(scenario)
  sim.advance(30_000)
  return { scenario, sim, cluster: sim.cluster() }
}

describe('GitOps self-heal (the hook E7-06 builds Argo CD on)', () => {
  it('puts drifted and deleted objects back as Git has them on each sync tick', () => {
    const { sim, cluster } = mini()
    manageNamespace(sim, {
      cluster: 'dev',
      namespace: 'shop',
      app: 'shop',
      selfHeal: true,
      intervalMs: 60_000,
    })
    const d = cluster.get('Deployment', 'shop', 'web')
    const cm = cluster.get('ConfigMap', 'shop', 'web-config')
    if (!d || !cm) throw new Error('fixture')
    d.spec.replicas = 5
    d.metadata.annotations = { ...d.metadata.annotations, note: 'hand edit' }
    cluster.put(d)
    cm.data = { ...cm.data, MODE: 'debug' }
    cluster.put(cm)
    cluster.delete('Secret', 'shop', 'web-secret')
    sim.advance(59_000)
    expect(cluster.get('Deployment', 'shop', 'web')?.spec.replicas).toBe(5)
    sim.advance(1_000)
    const healed = cluster.get('Deployment', 'shop', 'web')
    expect(healed?.spec.replicas).toBe(2)
    expect(healed?.metadata.annotations).not.toHaveProperty('note')
    // Controller-owned annotations survive.
    expect(healed?.metadata.annotations).toHaveProperty(['deployment.kubernetes.io/revision'])
    expect(cluster.get('ConfigMap', 'shop', 'web-config')?.data.MODE).toBe('calm')
    expect(cluster.get('Secret', 'shop', 'web-secret')).toMatchObject({
      kind: 'Secret',
      apiVersion: 'v1',
    })
    expect(auditLog(sim).map((e) => `${e.actor} ${e.verb} ${e.kind}/${e.name}`)).toEqual([
      'argocd sync Deployment/web',
      'argocd sync ConfigMap/web-config',
      'argocd sync Secret/web-secret',
    ])
    // Nothing drifted: the next tick changes nothing.
    sim.advance(60_000)
    expect(auditLog(sim)).toHaveLength(3)
  })

  it('recreates a deleted Deployment, keeps ticking after a restore, and can be re-declared', () => {
    const { scenario, sim, cluster } = mini()
    manageNamespace(sim, { cluster: 'dev', namespace: 'shop', app: 'shop', selfHeal: true })
    cluster.delete('Deployment', 'shop', 'web')
    const restored = restoreSimulation(scenario, sim.snapshot())
    restored.advance(DEFAULT_SYNC_MS)
    expect(restored.cluster().get('Deployment', 'shop', 'web')?.spec.replicas).toBe(2)
    restored.advance(60_000)
    expect(restored.cluster().list('Pod', { namespace: 'shop' }).length).toBeGreaterThanOrEqual(2)
    manageNamespace(restored, {
      cluster: 'dev',
      namespace: 'shop',
      app: 'shop-v2',
      selfHeal: false,
    })
    expect(managedBy(restored, 'dev', 'shop')?.app).toBe('shop-v2')
    expect(() => {
      manageNamespace(sim, { cluster: 'nowhere', namespace: 'x', app: 'x', selfHeal: true })
    }).toThrow(/no cluster/)
  })
})
