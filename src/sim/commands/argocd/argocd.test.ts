import { describe, expect, it } from 'vitest'
import { acTest } from '@/test/ac'
import { setImageBehaviour } from '../../controllers'
import { commit } from '../../gitops/git'
import { sync } from '../../gitops/argo'
import { gitopsScenario, webManifest } from '../../gitops/testing'
import { createShell } from '../index'

/** The four states every command is checked in. */
function state(name: 'synced' | 'out-of-sync' | 'degraded' | 'sync-failed') {
  const { sim } = gitopsScenario()
  sync(sim, 'shop')
  sim.advance(60_000)
  if (name === 'out-of-sync')
    commit(
      sim,
      'ravenpost-deploy',
      'main',
      { 'shop/web.yaml': webManifest('registry.example/web:1.1', 3) },
      'Web 1.1, three replicas',
    )
  if (name === 'degraded') {
    setImageBehaviour(sim, 'registry.example/web:broken', { pull: 'notFound' })
    commit(
      sim,
      'ravenpost-deploy',
      'main',
      {
        'shop/web.yaml': webManifest(
          'registry.example/web:broken',
          2,
          '\n  progressDeadlineSeconds: 60',
        ),
      },
      'Web broken',
    )
    sync(sim, 'shop')
    for (let i = 0; i < 80; i++) {
      sim.advance(1000)
      sim.reconcile()
    }
  }
  if (name === 'sync-failed')
    // Changing a Deployment's selector is refused by the API server: the sync fails.
    commit(
      sim,
      'ravenpost-deploy',
      'main',
      {
        'shop/web.yaml': webManifest('registry.example/web:1.0')
          .replace(/matchLabels: \{ app: web \}/, 'matchLabels: { app: web, tier: front }')
          .replace(
            /labels: \{ app: web \}\n {4}spec/,
            'labels: { app: web, tier: front }\n    spec',
          ),
      },
      'Add a tier label',
    )
  return { sim, sh: createShell(sim) }
}
const golden = (f: string) => `./__golden__/${f}.txt`
const text = (o: { stdout: string; stderr: string; exitCode: number }) =>
  `${o.stdout}${o.stderr ? `\n--- stderr ---\n${o.stderr}` : ''}\n--- exit ${String(o.exitCode)} ---\n`

describe('E7-04 argocd CLI: golden output', () => {
  for (const s of ['synced', 'out-of-sync', 'degraded', 'sync-failed'] as const)
    for (const [cmd, file] of [
      ['argocd app list', 'list'],
      ['argocd app get shop', 'get'],
      ['argocd app diff shop', 'diff'],
      ['argocd app history shop', 'history'],
      ['argocd app sync shop', 'sync'],
      ['argocd app get shop -o yaml', 'get-yaml'],
    ] as const)
      acTest('E7-04.AC1', `${cmd} when ${s}`, async () => {
        const { sh } = state(s)
        await expect(`$ ${cmd}\n${text(sh.run(cmd))}`).toMatchFileSnapshot(golden(`${s}-${file}`))
      })

  acTest(
    'E7-04.AC2',
    'app diff uses argocd’s format: a ===== header per resource, then diff’s classic output',
    () => {
      const { sh } = state('out-of-sync')
      const out = sh.run('argocd app diff shop')
      expect(out.exitCode).toBe(1)
      const lines = out.stdout.split('\n')
      expect(lines[0]).toBe('===== apps/Deployment shop/web ======')
      expect(
        lines
          .slice(1)
          .every((l) => /^(\d+(,\d+)?[acd]\d+(,\d+)?|< .*|---|> .*|===== .* ======|)$/.test(l)),
      ).toBe(true)
      expect(out.stdout).toMatch(/^< {7}- image: registry\.example\/web:1\.0$/m)
      expect(out.stdout).toMatch(/^> {7}- image: registry\.example\/web:1\.1$/m)
      expect(out.stdout).toMatch(/^< {3}replicas: 2\n---\n> {3}replicas: 3$/m)
      // Nothing to show: no output, exit 0.
      expect(state('synced').sh.run('argocd app diff shop')).toEqual({
        stdout: '',
        stderr: '',
        exitCode: 0,
      })
    },
  )

  acTest(
    'E7-04.AC3',
    'argocd is registered through the command registry (one file, one line)',
    async () => {
      const { readFileSync } = await import('node:fs')
      expect(
        readFileSync('src/sim/commands/registry.ts', 'utf8').split("from './argocd/argocd.ts'")
          .length - 1,
      ).toBe(1)
      expect(readFileSync('src/sim/commands/shell.ts', 'utf8')).not.toMatch(/argocd/)
    },
  )

  it('rollback, wait, refresh, login, completion and errors', () => {
    const { sim, sh } = state('synced')
    commit(
      sim,
      'ravenpost-deploy',
      'main',
      { 'shop/web.yaml': webManifest('registry.example/web:1.1') },
      'Web 1.1',
    )
    sh.run('argocd app sync shop')
    expect(sh.run('argocd app history shop').stdout.split('\n')).toHaveLength(4)
    // Rollback needs auto-sync off (it is, here) and goes back to the previous history entry.
    expect(sh.run('argocd app rollback shop').exitCode).toBe(0)
    sim.advance(60_000)
    expect(
      sim.cluster().get('Deployment', 'shop', 'web')?.spec.template.spec.containers[0]?.image,
    ).toBe('registry.example/web:1.0')
    expect(sh.run('argocd app rollback shop 9').stderr).toMatch(/does not have history with id 9/)
    expect(sh.run('argocd app wait shop --health --timeout 120').stdout).toMatch(
      /^Health Status: +Healthy$/m,
    )
    expect(sh.run('argocd app refresh shop').stdout).toMatch(/^Sync Status: +OutOfSync/m)
    expect(sh.run('argocd login argocd.ravenpost.example').stdout).toMatch(/logged in successfully/)
    expect(sh.run('argocd app get nope')).toMatchObject({
      stderr:
        'FATA[0000] rpc error: code = NotFound desc = applications.argoproj.io "nope" not found',
      exitCode: 20,
    })
    expect(sh.run('argocd app').exitCode).toBe(20)
    expect(sh.run('argocd app get').stderr).toMatch(/needs an application name/)
    expect(sh.run('argocd frobnicate').stderr).toMatch(/unknown command "frobnicate"/)
    expect(sh.run('argocd app list -o name').stdout).toBe('argocd/shop')
    expect(JSON.parse(sh.run('argocd app get shop -o json').stdout)).toMatchObject({
      kind: 'Application',
      spec: { destination: { namespace: 'shop' } },
    })
    expect(sh.complete('argocd app g').candidates).toEqual(['get'])
    expect(sh.complete('argocd app get s').candidates).toEqual(['shop'])
    // Automated apps refuse rollback; wait gives up on a degraded app.
    const auto = gitopsScenario({ prune: true, selfHeal: true })
    expect(createShell(auto.sim).run('argocd app rollback shop 0').stderr).toBe(
      'FATA[0000] rpc error: code = FailedPrecondition desc = rollback cannot be initiated when auto-sync is enabled',
    )
    expect(state('degraded').sh.run('argocd app wait shop --health').stderr).toMatch(
      /transitioned from Progressing to Degraded/,
    )
    expect(state('out-of-sync').sh.run('argocd app wait shop --sync --timeout 30').stderr).toMatch(
      /timed out \(30s\)/,
    )
  })
})
