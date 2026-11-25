import { describe, expect, it } from 'vitest'
import { acTest } from '@/test/ac'
import { createShell } from '../commands'
import { setImageBehaviour } from '../controllers'
import { sync, syncPreview } from './argo'
import { commit } from './git'
import { configManifest, gitopsScenario, webManifest } from './testing'
import { nodeDetails, podHealth, resourceTree, type TreeNode } from './tree'

const flat = (n: TreeNode, depth = 0): string[] => [
  `${'  '.repeat(depth)}${n.kind}/${n.name} ${n.health ?? '-'} ${n.sync ?? '-'}`,
  ...n.children.flatMap((c) => flat(c, depth + 1)),
]

describe('E7-05 resource tree and node details', () => {
  it('builds Application → Deployment → ReplicaSet → Pods, with Argo health per node', () => {
    const { sim } = gitopsScenario()
    sync(sim, 'shop')
    sim.advance(60_000)
    const tree = resourceTree(sim, 'shop')
    const lines = tree ? flat(tree) : []
    expect(lines[0]).toBe('Application/shop Healthy Synced')
    expect(lines).toContain('  ConfigMap/web-config - Synced')
    expect(lines).toContain('  Deployment/web Healthy Synced')
    const rs = lines.filter((l) => l.startsWith('    ReplicaSet/web-'))
    expect(rs).toHaveLength(1)
    expect(lines.filter((l) => /^ {6}Pod\/web-.* Healthy -$/.test(l))).toHaveLength(2)
    expect(resourceTree(sim, 'nope')).toBeUndefined()
  })

  it('shows a broken rollout: Degraded pods under a Progressing deployment', () => {
    const { sim } = gitopsScenario()
    sync(sim, 'shop')
    sim.advance(60_000)
    setImageBehaviour(sim, 'registry.example/web:broken', { pull: 'notFound' })
    commit(
      sim,
      'ravenpost-deploy',
      'main',
      { 'shop/web.yaml': webManifest('registry.example/web:broken') },
      'Broken',
    )
    sync(sim, 'shop')
    sim.advance(30_000)
    const tree = resourceTree(sim, 'shop')
    const dep = tree?.children.find((c) => c.kind === 'Deployment')
    expect(dep?.health).toBe('Progressing')
    expect(dep?.children).toHaveLength(2)
    const pods = dep?.children.flatMap((rs) => rs.children) ?? []
    expect(
      pods.some((p) => p.health === 'Degraded' && /pull|image/i.test(p.healthMessage ?? '')),
    ).toBe(true)
    const broken = pods.find((p) => p.health === 'Degraded')
    const details = broken && nodeDetails(sim, 'shop', broken)
    expect(details?.logs).toMatchObject({
      ok: false,
      error: expect.stringMatching(/waiting to start: trying and failing to pull image/) as unknown,
    })
    expect(details?.events.map((e) => e.reason)).toEqual(
      expect.arrayContaining(['Scheduled', 'Pulling', 'Failed']),
    )
  })

  acTest(
    'E7-05.AC2',
    'a pod node’s logs are the same lines `kubectl logs` prints for that pod',
    () => {
      const { sim } = gitopsScenario()
      sync(sim, 'shop')
      sim.advance(5 * 60_000)
      const pods =
        resourceTree(sim, 'shop')
          ?.children.find((c) => c.kind === 'Deployment')
          ?.children.flatMap((rs) => rs.children) ?? []
      expect(pods.length).toBe(2)
      const sh = createShell(sim)
      for (const pod of pods) {
        const d = nodeDetails(sim, 'shop', pod)
        const k = sh.run(`kubectl logs ${pod.name} -n shop`)
        expect(k.exitCode).toBe(0)
        expect(d?.logs).toEqual({
          ok: true,
          lines: k.stdout.split('\n').filter((l, i, a) => l !== '' || i < a.length - 1),
        })
        expect(d?.logs?.ok && d.logs.lines.length).toBeGreaterThan(0)
      }
    },
  )

  it('node details: live and desired manifests, the diff, events; Services and Endpoints; the app itself', () => {
    const { sim } = gitopsScenario()
    sync(sim, 'shop')
    sim.advance(60_000)
    commit(
      sim,
      'ravenpost-deploy',
      'main',
      { 'shop/config.yaml': configManifest.replace('MODE: calm', 'MODE: brisk') },
      'Brisk',
    )
    const d = nodeDetails(sim, 'shop', { kind: 'ConfigMap', name: 'web-config', namespace: 'shop' })
    expect(d?.live).toContain('MODE: calm')
    expect(d?.desired).toContain('MODE: brisk')
    expect(d?.diff).toMatch(/^< {3}MODE: calm\n---\n> {3}MODE: brisk$/m)
    expect(d?.live).not.toMatch(/resourceVersion|uid:|last-applied/)
    expect(
      nodeDetails(sim, 'shop', { kind: 'Application', name: 'shop', namespace: 'argocd' })?.live,
    ).toMatch(/^kind: Application$/m)
    expect(nodeDetails(sim, 'nope', { kind: 'Pod', name: 'x', namespace: 'shop' })).toBeUndefined()
    // Services the mini cluster has (outside the app) still resolve; their endpoints list the pods.
    const svc = sim.cluster().list('Service', { namespace: 'shop' })[0]
    if (svc) {
      const ep = nodeDetails(sim, 'shop', {
        kind: 'Endpoints',
        name: svc.metadata.name,
        namespace: 'shop',
      })
      expect(ep?.live).toMatch(/^kind: Endpoints$/m)
    }
    expect(
      podHealth({
        ...(sim.cluster().list('Pod', { namespace: 'shop' })[0] ?? ({} as never)),
        status: { phase: 'Succeeded' },
      }).status,
    ).toBe('Healthy')
  })

  it('a dry-run sync says what would change, and changes nothing', () => {
    const { sim } = gitopsScenario()
    sync(sim, 'shop')
    sim.advance(60_000)
    commit(
      sim,
      'ravenpost-deploy',
      'main',
      { 'shop/web.yaml': webManifest('registry.example/web:2.0'), 'shop/config.yaml': null },
      'Two',
    )
    const before = JSON.stringify(sim.snapshot())
    expect(syncPreview(sim, 'shop').rows).toEqual([
      { kind: 'Deployment', name: 'web', action: 'configured' },
      {
        kind: 'ConfigMap',
        name: 'web-config',
        action: 'unchanged',
        message: 'ignored (requires pruning)',
      },
    ])
    expect(syncPreview(sim, 'shop', { prune: true }).rows.at(-1)).toEqual({
      kind: 'ConfigMap',
      name: 'web-config',
      action: 'pruned',
    })
    expect(JSON.stringify(sim.snapshot())).toBe(before)
    commit(sim, 'ravenpost-deploy', 'main', { 'shop/web.yaml': 'kind: [' }, 'Oops')
    expect(syncPreview(sim, 'shop').error).toMatch(/error converting YAML/)
    expect(syncPreview(sim, 'nope').error).toMatch(/not found/)
  })
})
