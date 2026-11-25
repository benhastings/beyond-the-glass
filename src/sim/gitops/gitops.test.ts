import { describe, expect, it } from 'vitest'
import { acTest } from '@/test/ac'
import { auditLog, loadSimulation, restoreSimulation, setImageBehaviour } from '../controllers'
import { scenarioSchema, type ScenarioInput } from '../core/scenario'
import { miniScenarioInput } from '../core/testing'
import { application, deploymentHealth, refresh, sync } from './argo'
import {
  commit,
  createBranch,
  log,
  merge,
  mergeRequests,
  openMergeRequest,
  repo,
  resolve,
  revert,
  shortSha,
} from './git'
import { hasImage, imageTags, pushImage } from './registry'

const WEB = (image: string, replicas = 2) => `apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  labels: { app: web }
spec:
  replicas: ${String(replicas)}
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
const CONFIG =
  'apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: web-config\ndata:\n  GREETING: hello\n  MODE: calm\n'

/** The mini cluster, with Git describing its web Deployment and an Argo application deploying it. */
function gitopsScenario(
  automated: { prune?: boolean; selfHeal?: boolean } | undefined = { prune: true, selfHeal: true },
) {
  const base = miniScenarioInput()
  const input: ScenarioInput = {
    ...base,
    gitops: {
      reconcileInterval: '+3m',
      repos: {
        'ravenpost-deploy': {
          files: {
            'shop/web.yaml': WEB('registry.example/web:1.0'),
            'shop/config.yaml': CONFIG,
            'README.md': '# deploy\n',
          },
        },
      },
      applications: [
        {
          name: 'shop',
          source: { repo: 'ravenpost-deploy', path: 'shop', targetRevision: 'main' },
          destination: { cluster: 'dev', namespace: 'shop' },
          syncPolicy: { automated },
        },
      ],
    },
  }
  const scenario = scenarioSchema.parse(input)
  const sim = loadSimulation(scenario)
  return { scenario, sim }
}
const image = (sim: ReturnType<typeof loadSimulation>) =>
  sim.cluster().get('Deployment', 'shop', 'web')?.spec.template.spec.containers[0]?.image

describe('E7-01 virtual Git and registry', () => {
  it('commits, branches, merge requests and reverts, with deterministic SHAs', () => {
    const a = gitopsScenario().sim
    const b = gitopsScenario().sim
    expect(repo(a, 'ravenpost-deploy')?.branches.main).toBe(
      repo(b, 'ravenpost-deploy')?.branches.main,
    )
    createBranch(a, 'ravenpost-deploy', 'bump', 'main')
    const c = commit(
      a,
      'ravenpost-deploy',
      'bump',
      { 'shop/web.yaml': WEB('registry.example/web:1.1') },
      'Bump web to 1.1',
      'ana',
    )
    expect(c.sha).toMatch(/^[0-9a-f]{40}$/)
    expect(shortSha(c.sha)).toHaveLength(8)
    const mr = openMergeRequest(a, 'ravenpost-deploy', 'bump', 'main', 'Bump web to 1.1')
    expect(mergeRequests(a, 'ravenpost-deploy')).toHaveLength(1)
    const m = merge(a, mr.id)
    expect(m.parents).toHaveLength(2)
    expect(mergeRequests(a)[0]).toMatchObject({ state: 'merged', mergedSha: m.sha })
    expect(() => merge(a, mr.id)).toThrow(/not open/)
    expect(log(a, 'ravenpost-deploy', 'main').map((x) => x.message.split('\n')[0])).toEqual([
      "Merge branch 'bump' into 'main'",
      'Initial commit',
    ])
    const r = revert(a, 'ravenpost-deploy', 'main', m.sha)
    expect(r.files['shop/web.yaml']).toBe(WEB('registry.example/web:1.0'))
    expect(r.message).toMatch(/^Revert "Merge branch 'bump'/)
    const rp = repo(a, 'ravenpost-deploy')
    expect(rp && resolve(rp, shortSha(r.sha))?.sha).toBe(r.sha)
    expect(rp && resolve(rp, 'HEAD')?.sha).toBe(r.sha)
    const deleted = commit(a, 'ravenpost-deploy', 'main', { 'README.md': null }, 'Drop the readme')
    expect(deleted.files).not.toHaveProperty('README.md')
    expect(() => commit(a, 'nope', 'main', {}, 'x')).toThrow(/no repository/)
    expect(() => commit(a, 'ravenpost-deploy', 'nope', {}, 'x')).toThrow(/no branch/)
    expect(() =>
      revert(a, 'ravenpost-deploy', 'main', log(a, 'ravenpost-deploy', 'main').at(-1)?.sha ?? ''),
    ).toThrow(/initial commit/)
    pushImage(a, 'registry.example/web', '1.1', c.sha)
    expect(hasImage(a, 'registry.example/web:1.1')).toBe(true)
    expect(hasImage(a, 'registry.example/web:9')).toBe(false)
    expect(imageTags(a, 'registry.example/web')[0]).toMatchObject({
      tag: '1.1',
      sha: c.sha,
      digest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/) as unknown,
    })
  })
})

describe('E7-01 Argo CD applications', () => {
  acTest(
    'E7-01.AC1',
    'a manifest commit, applied through Argo, updates the cluster via the controllers',
    () => {
      const { sim } = gitopsScenario()
      // The first tick adopts what Git describes (a simpler template here, so a rollout follows).
      sim.advance(180_000)
      sim.advance(60_000)
      expect(refresh(sim, 'shop')?.status).toMatchObject({ sync: 'Synced', health: 'Healthy' })
      commit(
        sim,
        'ravenpost-deploy',
        'main',
        { 'shop/web.yaml': WEB('registry.example/web:1.1', 3) },
        'Web 1.1, three replicas',
      )
      expect(refresh(sim, 'shop')?.status.sync).toBe('OutOfSync')
      // The next reconcile tick syncs it; the Deployment controller rolls it out.
      sim.advance(180_000)
      sim.advance(60_000)
      expect(image(sim)).toBe('registry.example/web:1.1')
      const pods = sim
        .cluster()
        .list('Pod', { namespace: 'shop' })
        .filter((p) => !p.metadata.deletionTimestamp)
      expect(pods).toHaveLength(3)
      expect(pods.every((p) => p.spec.containers[0]?.image === 'registry.example/web:1.1')).toBe(
        true,
      )
      const app = refresh(sim, 'shop')
      expect(app?.status).toMatchObject({ sync: 'Synced', health: 'Healthy' })
      expect(app?.status.history.map((h) => h.revision)).toEqual([
        expect.any(String),
        repo(sim, 'ravenpost-deploy')?.branches.main,
      ])
      expect(app?.status.resources.map((r) => `${r.kind}/${r.name}:${r.status}`).sort()).toEqual([
        'ConfigMap/web-config:Synced',
        'Deployment/web:Synced',
      ])
      expect(
        auditLog(sim).some(
          (e) => e.actor === 'argocd' && e.verb === 'sync' && e.kind === 'Deployment',
        ),
      ).toBe(true)
    },
  )

  acTest(
    'E7-01.AC2',
    'health follows Argo’s rules: Progressing until the rollout completes, Degraded past the deadline',
    () => {
      const { sim } = gitopsScenario({ prune: false, selfHeal: false })
      sync(sim, 'shop')
      sim.advance(60_000)
      expect(refresh(sim, 'shop')?.status.health).toBe('Healthy')
      // A new version: Progressing while it rolls out, Healthy when done.
      commit(
        sim,
        'ravenpost-deploy',
        'main',
        { 'shop/web.yaml': WEB('registry.example/web:1.1') },
        'Web 1.1',
      )
      sync(sim, 'shop')
      expect(refresh(sim, 'shop')?.status.health).toBe('Progressing')
      expect(
        application(sim, 'shop')?.status.resources.find((r) => r.kind === 'Deployment')
          ?.healthMessage,
      ).toMatch(/^Waiting for rollout to finish/)
      sim.advance(60_000)
      expect(refresh(sim, 'shop')?.status.health).toBe('Healthy')
      // An image that never pulls, with a short deadline: Degraded once the deadline passes.
      setImageBehaviour(sim, 'registry.example/web:broken', { pull: 'notFound' })
      commit(
        sim,
        'ravenpost-deploy',
        'main',
        {
          'shop/web.yaml': WEB('registry.example/web:broken').replace(
            '  replicas: 2',
            '  replicas: 2\n  progressDeadlineSeconds: 60',
          ),
        },
        'Web broken',
      )
      sync(sim, 'shop')
      expect(refresh(sim, 'shop')?.status.health).toBe('Progressing')
      for (let i = 0; i < 90; i++) {
        sim.advance(1000)
        sim.reconcile()
      }
      const app = refresh(sim, 'shop')
      expect(app?.status.health).toBe('Degraded')
      expect(app?.status.resources.find((r) => r.kind === 'Deployment')?.healthMessage).toBe(
        'Deployment "web" exceeded its progress deadline',
      )
      // Paused is Suspended; a deleted resource is Missing.
      const d = sim.cluster().get('Deployment', 'shop', 'web')
      if (d)
        expect(deploymentHealth({ ...d, spec: { ...d.spec, paused: true } }).status).toBe(
          'Suspended',
        )
      sim.cluster().delete('ConfigMap', 'shop', 'web-config')
      expect(
        refresh(sim, 'shop')?.status.resources.find((r) => r.kind === 'ConfigMap'),
      ).toMatchObject({ status: 'OutOfSync' })
    },
  )

  acTest(
    'E7-01.AC3',
    'the model is framework-free and lives in snapshots: a restored simulation carries on identically',
    async () => {
      const { scenario, sim } = gitopsScenario()
      sim.advance(180_000)
      commit(
        sim,
        'ravenpost-deploy',
        'main',
        { 'shop/web.yaml': WEB('registry.example/web:1.2') },
        'Web 1.2',
      )
      const restored = restoreSimulation(scenario, sim.snapshot())
      for (const s of [sim, restored]) s.advance(240_000)
      expect(JSON.stringify(restored.snapshot())).toBe(JSON.stringify(sim.snapshot()))
      expect(image(restored)).toBe('registry.example/web:1.2')
      const { readFileSync, readdirSync } = await import('node:fs')
      for (const f of readdirSync('src/sim/gitops').filter(
        (x) => x.endsWith('.ts') && !x.endsWith('.test.ts'),
      ))
        expect(readFileSync(`src/sim/gitops/${f}`, 'utf8'), f).not.toMatch(
          /from 'react|document\.|window\.|Math\.random|Date\.now/,
        )
    },
  )

  it('self-heal, prune, manual sync and broken sources', () => {
    const { sim } = gitopsScenario()
    sim.advance(180_000)
    // Drift is put back on the next tick with self-heal on.
    const d = sim.cluster().get('Deployment', 'shop', 'web')
    if (d) {
      d.spec.replicas = 5
      sim.cluster().put(d)
    }
    expect(refresh(sim, 'shop')?.status.sync).toBe('OutOfSync')
    sim.advance(180_000)
    expect(sim.cluster().get('Deployment', 'shop', 'web')?.spec.replicas).toBe(2)
    // Removing a manifest prunes what it described.
    commit(sim, 'ravenpost-deploy', 'main', { 'shop/config.yaml': null }, 'Drop the config map')
    sim.advance(180_000)
    expect(sim.cluster().get('ConfigMap', 'shop', 'web-config')).toBeUndefined()
    expect(auditLog(sim).some((e) => e.verb === 'prune' && e.name === 'web-config')).toBe(true)
    // Bad YAML: Unknown, with the reason; a manual sync fails with it too.
    commit(sim, 'ravenpost-deploy', 'main', { 'shop/web.yaml': 'kind: [' }, 'Oops')
    expect(refresh(sim, 'shop')?.status).toMatchObject({
      sync: 'Unknown',
      health: 'Unknown',
      conditions: [expect.stringMatching(/^shop\/web\.yaml: error converting YAML/) as unknown],
    })
    expect(sync(sim, 'shop')?.status.operationState).toMatchObject({ phase: 'Failed' })
    // Without self-heal, automated sync takes each new revision once and leaves later drift alone.
    const manual = gitopsScenario({ prune: false, selfHeal: false }).sim
    manual.advance(180_000)
    const md = manual.cluster().get('Deployment', 'shop', 'web')
    if (md) {
      md.spec.replicas = 4
      manual.cluster().put(md)
    }
    manual.advance(360_000)
    expect(manual.cluster().get('Deployment', 'shop', 'web')?.spec.replicas).toBe(4)
    expect(application(manual, 'shop')?.status.sync).toBe('OutOfSync')
  })
})
