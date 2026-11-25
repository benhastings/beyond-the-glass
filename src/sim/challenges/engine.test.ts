import ravenpost from '@/scenarios/ravenpost.yaml'
import { CHALLENGES } from '@/challenges'
import { SCENARIOS } from '@/scenarios'
import { describe, expect, it } from 'vitest'
import { acTest } from '@/test/ac'
import { loadSimulation, restoreSimulation } from '../controllers'
import { createShell } from '../commands'
import { attach, ChallengeRun } from './engine'
import { challengeSchema, type ChallengeInput, type Predicate } from './schema'

const base: ChallengeInput = {
  id: 'test',
  title: 'Test',
  scenario: 'ravenpost',
  brief: 'Test.',
  questions: [{ id: 'q', prompt: 'Which?' }],
  objectives: [{ id: 'o', text: 'Do it', check: { type: 'ranCommand', pattern: '^pwd$' } }],
  hints: [
    { level: 'nudge', text: 'n' },
    { level: 'pointer', text: 'p' },
    { level: 'command', text: 'c' },
  ],
  expertPath: ['pwd'],
}

function setup(patch: Partial<ChallengeInput> = {}) {
  const sim = loadSimulation(ravenpost)
  const session = { history: [] as string[] }
  const sh = createShell(sim, session)
  const run = new ChallengeRun(sim, challengeSchema.parse({ ...base, ...patch }), session.history)
  attach(run, session)
  const check = (p: Predicate) =>
    run.check(
      challengeSchema.parse({ ...base, objectives: [{ id: 'o', text: 't', check: p }] })
        .objectives[0]?.check ?? p,
    )
  return { sim, sh, run, check }
}

describe('E6-10 predicates', () => {
  acTest('E6-10.AC2', 'ranCommand and noForbidden match the command history', () => {
    const { sh, check } = setup()
    const ran = { type: 'ranCommand', pattern: '^kubectl get pods\\b' } as const
    const forbidden = { type: 'noForbidden', pattern: 'delete\\s+ns' } as const
    expect(check(ran)).toBe(false)
    expect(check(forbidden)).toBe(true)
    sh.run('kubectl get pods -n ravenpost')
    expect(check(ran)).toBe(true)
    sh.run('kubectl delete ns ravenpost')
    expect(check(forbidden)).toBe(false)
  })

  acTest(
    'E6-10.AC2',
    'resourceState checks a path on the selected objects, with all/any/none',
    () => {
      const { sh, check } = setup()
      const api = { kind: 'Deployment', namespace: 'ravenpost', name: 'ravenpost-api' } as const
      expect(
        check({
          type: 'resourceState',
          resource: api,
          path: 'spec.replicas',
          equals: '3',
          quantifier: 'all',
        }),
      ).toBe(true)
      expect(
        check({
          type: 'resourceState',
          resource: api,
          path: 'spec.replicas',
          equals: '5',
          quantifier: 'all',
        }),
      ).toBe(false)
      sh.run('kubectl scale deploy ravenpost-api -n ravenpost --replicas=5')
      expect(
        check({
          type: 'resourceState',
          resource: api,
          path: 'spec.replicas',
          equals: '5',
          quantifier: 'all',
        }),
      ).toBe(true)
      const pods = { kind: 'Pod', namespace: 'ravenpost' } as const
      const running = {
        type: 'resourceState',
        resource: pods,
        path: 'status.containerStatuses[0].ready',
        equals: 'true',
      } as const
      expect(check({ ...running, quantifier: 'all' })).toBe(false)
      expect(check({ ...running, quantifier: 'any' })).toBe(true)
      expect(check({ ...running, quantifier: 'none' })).toBe(false)
      expect(
        check({
          type: 'resourceState',
          resource: { ...pods, namePrefix: 'ravenpost-notifier-' },
          path: 'status.containerStatuses[0].state.waiting.reason',
          matches: 'CrashLoop',
          quantifier: 'all',
        }),
      ).toBe(true)
      // Nothing selected: "all" is false (there must be something), "none" is true.
      const nothing = { kind: 'Pod', namespace: 'nowhere' } as const
      expect(
        check({ type: 'resourceState', resource: nothing, path: 'x', quantifier: 'all' }),
      ).toBe(false)
      expect(
        check({ type: 'resourceState', resource: nothing, path: 'x', quantifier: 'none' }),
      ).toBe(true)
      expect(
        check({
          type: 'resourceState',
          resource: { kind: 'Service', namespace: 'ravenpost', labels: { app: 'ravenpost-web' } },
          path: 'spec.type',
          equals: 'ClusterIP',
          quantifier: 'all',
        }),
      ).toBe(true)
    },
  )

  acTest(
    'E6-10.AC2',
    'answered matches exact text, a pattern, or a resource name (or a unique prefix of one)',
    () => {
      const { run, check } = setup()
      const failing = {
        kind: 'Pod',
        namespace: 'ravenpost',
        where: { path: 'status.containerStatuses[0].ready', equals: 'false' },
      } as const
      const byName = {
        type: 'answered',
        question: 'q',
        matcher: { resource: failing, allowPrefix: true },
      } as const
      expect(check(byName)).toBe(false)
      run.answer('q', 'ravenpost-api')
      expect(check(byName)).toBe(false)
      run.answer('q', 'ravenpost-')
      expect(check(byName)).toBe(false)
      run.answer('q', 'ravenpost-notifier')
      expect(check(byName)).toBe(true)
      run.answer('q', 'ravenpost-notifier-79c79b9687-rd2j2')
      expect(check(byName)).toBe(true)
      expect(check({ ...byName, matcher: { resource: failing, allowPrefix: false } })).toBe(true)
      run.answer('q', 'ravenpost-notifier')
      expect(check({ ...byName, matcher: { resource: failing, allowPrefix: false } })).toBe(false)
      run.answer('q', '  SMTP Relay ')
      expect(
        check({
          type: 'answered',
          question: 'q',
          matcher: { equals: 'smtp relay', caseSensitive: false },
        }),
      ).toBe(true)
      expect(
        check({
          type: 'answered',
          question: 'q',
          matcher: { equals: 'smtp relay', caseSensitive: true },
        }),
      ).toBe(false)
      expect(check({ type: 'answered', question: 'q', matcher: { matches: 'relay$' } })).toBe(true)
      expect(run.answer('nope', 'x')).toMatch(/no question "nope"/)
    },
  )

  acTest('E6-10.AC2', 'mutated looks at the audit log; all and any combine', () => {
    const { sh, check } = setup()
    const undo = {
      type: 'mutated',
      verb: 'rollout-undo',
      kind: 'Deployment',
      name: 'ravenpost-api',
    } as const
    expect(check(undo)).toBe(false)
    sh.run(
      'kubectl set image deploy/ravenpost-api api=registry.example/ravenpost/api:1.15.0 -n ravenpost',
    )
    sh.run('kubectl rollout undo deploy/ravenpost-api -n ravenpost')
    expect(check(undo)).toBe(true)
    expect(check({ type: 'mutated', verb: 'delete' })).toBe(false)
    const ran = { type: 'ranCommand', pattern: 'rollout undo' } as const
    expect(check({ type: 'all', of: [undo, ran] })).toBe(true)
    expect(check({ type: 'all', of: [undo, { type: 'mutated', verb: 'delete' }] })).toBe(false)
    expect(check({ type: 'any', of: [{ type: 'mutated', verb: 'delete' }, ran] })).toBe(true)
  })
})

describe('E6-10 engine', () => {
  acTest(
    'E6-10.AC1',
    'evaluating every challenge after a command takes under 5 ms on a typical state',
    () => {
      for (const c of Object.values(CHALLENGES)) {
        const sim = loadSimulation(SCENARIOS[c.scenario] ?? ravenpost)
        const session = { history: [] as string[] }
        const sh = createShell(sim, session)
        const run = new ChallengeRun(sim, c, session.history)
        for (const l of [
          'kubectl get pods -A',
          'kubectl describe pod ravenpost-notifier -n ravenpost',
          'kubectl get events -A',
        ])
          sh.run(l)
        run.evaluate()
        const n = 200
        // Wall-clock time from Node (the simulator's own code never reads a real clock).
        const start = process.hrtime.bigint()
        for (let i = 0; i < n; i++) run.evaluate()
        expect(Number(process.hrtime.bigint() - start) / 1e6 / n, c.id).toBeLessThan(5)
      }
    },
  )

  acTest(
    'E6-10.AC3',
    'the hint ladder unlocks one rung at a time, is recorded, and never blocks completion',
    () => {
      const { sh, run, sim } = setup()
      expect(sh.run('hint').stdout).toBe('Hint 1 of 3 (nudge): n')
      expect(sh.run('hint').stdout).toBe('Hint 2 of 3 (pointer): p')
      expect(sh.run('hint').stdout).toBe('Hint 3 of 3 (command): c')
      expect(sh.run('hint').stdout).toBe('Hint 3 of 3 (command): c')
      expect(run.state.hintsUsed).toBe(3)
      sh.run('pwd')
      expect(run.evaluate().complete).toBe(true)
      // Recorded in the simulation, so it's in the saved snapshot too.
      const again = new ChallengeRun(
        restoreSimulation(ravenpost, sim.snapshot()),
        run.challenge,
        [],
      )
      expect(again.state.hintsUsed).toBe(3)
      expect(again.evaluate().complete).toBe(true)
    },
  )

  it('flags forbidden commands without blocking, and stays complete once complete', () => {
    const { sh, run } = setup({ forbidden: [{ pattern: 'delete\\s+ns', message: 'Not that.' }] })
    sh.run('kubectl delete ns ravenpost')
    expect(run.evaluate()).toMatchObject({ warnings: ['Not that.'], complete: false })
    sh.run('pwd')
    expect(run.evaluate().complete).toBe(true)
    expect(sh.run('answer').stderr).toMatch(/^Usage: answer/)
    expect(createShell(loadSimulation(ravenpost)).run('answer q x').stderr).toMatch(
      /no challenge running/,
    )
  })
})

describe('E6-10 challenges', () => {
  acTest('E6-10.AC4', 'every challenge is solvable: its expert path completes it', () => {
    expect(Object.keys(CHALLENGES).length).toBeGreaterThan(0)
    for (const c of Object.values(CHALLENGES)) {
      const scenario = SCENARIOS[c.scenario]
      expect(scenario, `${c.id}: scenario ${c.scenario}`).toBeDefined()
      if (!scenario) continue
      const sim = loadSimulation(scenario)
      const session = { history: [] as string[] }
      const sh = createShell(sim, session)
      const run = new ChallengeRun(sim, c, session.history)
      attach(run, session)
      expect(run.evaluate().complete, `${c.id} complete before starting`).toBe(false)
      for (const line of c.expertPath) {
        const out = sh.run(line)
        expect(out.exitCode, `${c.id}: ${line}\n${out.stderr}`).toBe(0)
      }
      const e = run.evaluate()
      expect(
        e.objectives.filter((o) => !o.done).map((o) => o.id),
        c.id,
      ).toEqual([])
      expect(e.warnings, c.id).toEqual([])
      expect(e.complete).toBe(true)
    }
  })
})
