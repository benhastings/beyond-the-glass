import { describe, expect, it } from 'vitest'
import { acTest } from '@/test/ac'
import { scenarioSchema } from '../core/scenario'
import { Simulator } from '../core/simulator'
import { miniScenarioInput } from '../core/testing'
import { createShell, isProdContext, promptState } from './index'

/** Three clusters, three contexts: the shape a lesson on context safety uses. */
export function threeClusters() {
  const base = miniScenarioInput()
  const c0 = base.clusters[0]
  if (!c0) throw new Error('fixture')
  return scenarioSchema.parse({
    ...base,
    currentContext: 'dev',
    contexts: [
      { name: 'dev', cluster: 'dev', user: 'dev-admin', namespace: 'shop' },
      { name: 'stage', cluster: 'stage', user: 'stage-admin' },
      { name: 'prod', cluster: 'prod', user: 'prod-admin', namespace: 'shop' },
    ],
    clusters: [
      c0,
      { ...c0, name: 'stage', server: 'https://stage.example:6443' },
      { ...c0, name: 'prod', server: 'https://prod.example:6443' },
    ],
  })
}

describe('kubectl config', () => {
  acTest('E6-12.AC2', 'get-contexts prints kubectl’s table with * on the current context', () => {
    const sh = createShell(Simulator.load(threeClusters()))
    expect(sh.run('kubectl config get-contexts').stdout).toBe(
      [
        // Columns are their widest cell plus 3, and at least 6 wide, like every kubectl table.
        'CURRENT   NAME    CLUSTER   AUTHINFO      NAMESPACE',
        '*         dev     dev       dev-admin     shop',
        '          stage   stage     stage-admin   ',
        '          prod    prod      prod-admin    shop',
      ].join('\n'),
    )
    sh.run('kubectl config use-context prod')
    expect(sh.run('kubectl config get-contexts --no-headers').stdout.split('\n')[2]).toMatch(
      /^\* {5}prod/,
    )
    expect(sh.run('kubectl config get-contexts stage').stdout.split('\n')).toHaveLength(2)
    expect(sh.run('kubectl config get-contexts -o name').stdout).toBe('dev\nstage\nprod')
    expect(sh.run('kubectl config get-contexts nope')).toMatchObject({
      exitCode: 1,
      stderr: 'error: context nope not found',
    })
  })

  acTest('E6-12.AC2', 'current-context and use-context answer like kubectl', () => {
    const sim = Simulator.load(threeClusters())
    const sh = createShell(sim)
    expect(sh.run('kubectl config current-context').stdout).toBe('dev')
    expect(sh.run('kubectl config use-context prod').stdout).toBe('Switched to context "prod".')
    expect(sim.currentContext).toBe('prod')
    expect(sh.run('kubectl config current-context').stdout).toBe('prod')
    expect(sh.run('kubectl config use-context qa')).toMatchObject({
      exitCode: 1,
      stderr: 'error: no context exists with the name: "qa"',
    })
    expect(sh.run('kubectl config use-context').exitCode).toBe(1)
  })

  it('set-context --current --namespace changes where commands look, and survives a snapshot', () => {
    const scenario = threeClusters()
    const sim = Simulator.load(scenario)
    const sh = createShell(sim)
    sh.run('kubectl config use-context stage')
    expect(sh.run('kubectl get pods').stderr).toBe('No resources found in default namespace.')
    expect(sh.run('kubectl config set-context --current --namespace=shop').stdout).toBe(
      'Context "stage" modified.',
    )
    expect(sh.run('kubectl get pods').stdout).toMatch(/^NAME/)
    expect(sh.run('kubectl config get-contexts stage').stdout).toMatch(/stage-admin +shop$/)
    expect(Simulator.restore(scenario, sim.snapshot()).namespace('stage')).toBe('shop')
    expect(sh.run('kubectl config set-context dev --namespace=kube-system').stdout).toBe(
      'Context "dev" modified.',
    )
    expect(sim.namespace('dev')).toBe('kube-system')
    expect(sh.run('kubectl config set-context new --namespace=x').stderr).toMatch(/isn't supported/)
    expect(sh.run('kubectl config set-context').exitCode).toBe(1)
    expect(sh.run('kubectl config set-context --current').stdout).toBe('Context "stage" modified.')
  })

  it('--context acts on another cluster without switching', () => {
    const sim = Simulator.load(threeClusters())
    const sh = createShell(sim)
    expect(sh.run('kubectl get pods --context prod -n shop').stdout).toMatch(/^NAME/)
    expect(sim.currentContext).toBe('dev')
  })

  it('other subcommands explain themselves, and help lists what works', () => {
    const sh = createShell(Simulator.load(threeClusters()))
    expect(sh.run('kubectl config view').stderr).toMatch(
      /only supports current-context, get-contexts, use-context, set-context/,
    )
    expect(sh.run('kubectl config').stdout).toMatch(/Available Commands in this simulator/)
    expect(sh.complete('kubectl config u').candidates).toEqual(['use-context'])
    expect(sh.complete('kubectl config use-context p').candidates).toEqual(['prod'])
    expect(sh.complete('kubectl config view x').candidates).toEqual([])
  })

  it('knows which contexts are production', () => {
    expect(
      ['prod', 'prod-eu', 'eu.production', 'kind-prod'].map((n) => isProdContext(n, '')),
    ).toEqual([true, true, true, true])
    expect(['product-catalog', 'dev', 'preprod-ish'].map((n) => isProdContext(n, 'dev'))).toEqual([
      false,
      false,
      false,
    ])
    expect(isProdContext('admin', 'prod')).toBe(true)
    const sim = Simulator.load(threeClusters())
    expect(promptState(sim)).toEqual({
      context: 'dev',
      cluster: 'dev',
      namespace: 'shop',
      prod: false,
    })
    sim.useContext('prod')
    expect(promptState(sim)).toEqual({
      context: 'prod',
      cluster: 'prod',
      namespace: 'shop',
      prod: true,
    })
  })
})
