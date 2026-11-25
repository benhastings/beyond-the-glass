import { describe, expect, it } from 'vitest'
import { acTest } from '@/test/ac'
import { ChallengeRun } from '../../challenges/engine'
import { challengeSchema, type Predicate } from '../../challenges/schema'
import { createShell } from '../../commands'
import { loadSimulation } from '../../controllers'
import { parseDuration } from '../../core/duration'
import { scenarioSchema, type ScenarioInput } from '../../core/scenario'
import type { Simulator } from '../../core/simulator'
import { application, compareApp } from '../argo'
import { gitopsInput } from '../testing'
import { nodeDetails } from '../tree'
import {
  composeFragments,
  fragment,
  FRAGMENTS,
  playExpertPath,
  type ScenarioFragment,
  type Target,
} from './index'

const TARGET = {
  app: 'shop',
  repo: 'ravenpost-deploy',
  file: 'shop/web.yaml',
  namespace: 'shop',
  deployment: 'web',
  image: 'registry.example/web',
  tag: '1.0',
  at: '+5m',
}

const holds = (sim: Simulator, check: Predicate, history: readonly string[] = []) =>
  new ChallengeRun(
    sim,
    challengeSchema.parse({
      id: 't',
      title: 'T',
      scenario: 'mini',
      brief: 'B.',
      objectives: [{ id: 'o', text: 'o', check }],
      hints: [
        { level: 'nudge', text: 'n' },
        { level: 'pointer', text: 'p' },
        { level: 'command', text: 'c' },
      ],
      expertPath: ['pwd'],
    }),
    history,
  ).check(check)

function load(input: ScenarioInput) {
  return loadSimulation(scenarioSchema.parse(input))
}
const f = (id: string) => fragment(id) as unknown as ScenarioFragment
/** Long enough for the trouble to show: the fragment's time, then a stalled rollout's deadline. */
const settle = (sim: Simulator, at: string) => {
  sim.advance(parseDuration(at) + 12 * 60_000)
}

describe('E7-06 GitOps scenario fragments', () => {
  acTest(
    'E7-06.AC1',
    'every expert path of every fragment solves it (and it isn’t solved before)',
    () => {
      expect(FRAGMENTS.map((x) => (x as unknown as ScenarioFragment).id)).toEqual([
        'drift-self-heal',
        'manual-sync',
        'sync-failed',
        'bad-release',
      ])
      for (const frag of FRAGMENTS) {
        const def = frag as unknown as ScenarioFragment
        const params = def.params.parse(TARGET)
        for (const path of def.expertPaths(params)) {
          const sim = load(composeFragments(gitopsInput(), [{ fragment: frag, params: TARGET }]))
          settle(sim, params.at)
          expect(holds(sim, def.solved(params)), `${def.id}: solved before "${path.name}"`).toBe(
            false,
          )
          const history = playExpertPath(sim, path.steps)
          expect(holds(sim, def.solved(params), history), `${def.id}: "${path.name}"`).toBe(true)
          expect(path.tradeOff.length).toBeGreaterThan(20)
        }
      }
    },
  )

  it('each fragment shows its trouble: reverted drift, an out-of-sync merge, a failed sync, a degraded rollout', () => {
    const run = (id: string) => {
      const sim = load(
        composeFragments(gitopsInput(), [{ fragment: fragment(id) as never, params: TARGET }]),
      )
      settle(sim, '+5m')
      return { sim, sh: createShell(sim) }
    }
    const manual = run('manual-sync')
    expect(manual.sh.run('argocd app get shop').stdout).toMatch(
      /^Sync Status: +OutOfSync from main/m,
    )
    const failed = run('sync-failed')
    const out = failed.sh.run('argocd app get shop').stdout
    expect(out).toMatch(/^Phase: +Failed$/m)
    expect(out).toMatch(/spec\.selector: Invalid value: .*field is immutable/)
    // Automated sync doesn't retry a revision it failed on.
    const attempts = () =>
      failed.sim
        .cluster()
        .list('Event', { namespace: 'argocd' })
        .filter((e) => e.reason === 'OperationCompleted' && e.type === 'Warning')[0]?.count
    const before = attempts()
    failed.sim.advance(10 * 60_000)
    expect(attempts()).toBe(before)
    const bad = run('bad-release')
    expect(compareApp(bad.sim, 'shop')?.health).toBe('Degraded')
    expect(bad.sh.run('kubectl get pods -n shop').stdout).toMatch(/ErrImagePull|ImagePullBackOff/)
    // The rollback path leaves Git asking for the bad release: Argo says so.
    playExpertPath(
      bad.sim,
      f('bad-release').expertPaths(f('bad-release').params.parse(TARGET))[1]?.steps ?? [],
    )
    expect(application(bad.sim, 'shop')?.status.sync).toBe('OutOfSync')
    expect(bad.sh.run('argocd app rollback shop 0').exitCode).toBe(0)
  })

  acTest(
    'E7-06.AC2',
    'self-heal’s revert is an event in Argo CD and in `kubectl get events`',
    () => {
      const sim = load(
        composeFragments(gitopsInput(), [
          { fragment: fragment('drift-self-heal') as never, params: TARGET },
        ]),
      )
      sim.advance(4 * 60_000)
      const sh = createShell(sim)
      sh.run('kubectl scale deployment/web -n shop --replicas=4')
      expect(sim.cluster().get('Deployment', 'shop', 'web')?.spec.replicas).toBe(4)
      sim.advance(3 * 60_000)
      expect(sim.cluster().get('Deployment', 'shop', 'web')?.spec.replicas).toBe(2)
      // In Argo: the Application's events.
      const events =
        nodeDetails(sim, 'shop', { kind: 'Application', name: 'shop', namespace: 'argocd' })
          ?.events ?? []
      expect(events.map((e) => `${e.reason}: ${e.message}`)).toEqual(
        expect.arrayContaining([
          'ResourceUpdated: Updated sync status: Synced -> OutOfSync',
          expect.stringMatching(/^OperationStarted: Initiated automated sync to '[0-9a-f]{40}'$/),
          expect.stringMatching(/^OperationCompleted: Sync operation to [0-9a-f]{40} succeeded$/),
          'ResourceUpdated: Updated sync status: OutOfSync -> Synced',
        ]),
      )
      expect(application(sim, 'shop')?.status.operationState).toMatchObject({
        initiatedBy: 'automated',
        phase: 'Succeeded',
      })
      // In kubectl.
      const k = sh.run('kubectl get events -n argocd')
      expect(k.exitCode).toBe(0)
      expect(k.stdout).toMatch(
        /Normal +ResourceUpdated +application\/shop +Updated sync status: Synced -> OutOfSync/,
      )
      expect(k.stdout).toMatch(
        /Normal +OperationStarted +application\/shop +Initiated automated sync to/,
      )
    },
  )

  acTest(
    'E7-06.AC3',
    'fragments compose into one scenario (as the capstone will), and conflicting ones are refused',
    () => {
      const later = { ...TARGET, at: '+40m' }
      const input = composeFragments(gitopsInput(), [
        { fragment: fragment('drift-self-heal') as never, params: TARGET },
        { fragment: fragment('bad-release') as never, params: later },
      ])
      const sim = load(input)
      sim.advance(5 * 60_000)
      const drift = f('drift-self-heal')
      const dp = drift.params.parse(TARGET)
      const h1 = playExpertPath(sim, drift.expertPaths(dp)[0]?.steps ?? [])
      expect(holds(sim, drift.solved(dp), h1)).toBe(true)
      // The second act: the bad release, after the first is solved.
      sim.advance(parseDuration('+40m') - sim.now + 12 * 60_000)
      const bad = f('bad-release')
      const bp = bad.params.parse(later) as Target & { badTag: string }
      expect(holds(sim, bad.solved(bp))).toBe(false)
      const h2 = playExpertPath(sim, bad.expertPaths(bp)[0]?.steps ?? [])
      expect(holds(sim, bad.solved(bp), h2)).toBe(true)
      // Drift needs self-heal; a manual-sync fragment needs auto-sync off: not on the same app.
      expect(() =>
        composeFragments(gitopsInput(), [
          { fragment: fragment('drift-self-heal') as never, params: TARGET },
          { fragment: fragment('manual-sync') as never, params: TARGET },
        ]),
      ).toThrow(
        'fragments drift-self-heal and manual-sync need different sync policies for app shop',
      )
      expect(() =>
        composeFragments(gitopsInput(), [
          { fragment: fragment('manual-sync') as never, params: { ...TARGET, app: 'nope' } },
        ]),
      ).toThrow(/no Argo CD application nope/)
      expect(fragment('nope')).toBeUndefined()
    },
  )
})
