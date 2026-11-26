import { describe, expect, it } from 'vitest'
import { SCENARIOS } from '@/scenarios'
import { acTest } from '@/test/ac'
import { createShell } from '../commands'
import { loadSimulation, restoreSimulation } from '../controllers'
import { parseDuration } from '../core/duration'
import type { Simulator } from '../core/simulator'
import { playExpertPath } from '../gitops/fragments/define'
import { rangeSeries } from '../telemetry/metrics'
import { CapstoneRun } from './engine'

const MIN = 60_000
const scenario = SCENARIOS['the-long-night']
if (!scenario) throw new Error('no the-long-night scenario')

/** Plays the expert path of every act, as a learner would, through the engine. */
function expertNight(sim: Simulator, until = Infinity): CapstoneRun {
  const run = new CapstoneRun(sim)
  run.start()
  for (let guard = 0; !run.finished && guard < 8 && run.actIndex < until; guard++) {
    const act = run.current
    if (!act) break
    run.idle(parseDuration(act.minDuration))
    const i = run.actIndex
    playExpertPath(sim, act.expertPath, (step) => {
      if ('run' in step) run.record(step.run)
      else run.tick()
    })
    const actNow = () => run.actIndex
    const done = () => run.finished
    for (let k = 0; k < 20 && actNow() === i && !done(); k++) run.idle(MIN)
    if (act.diagnosis) run.diagnose(act.id, act.diagnosis.options.find((o) => o.correct)?.id ?? '')
  }
  return run
}

describe('E10-03 capstone engine', () => {
  acTest(
    'E10-03.AC1',
    'the expert playthrough completes all four acts, the same way every time',
    () => {
      const a = loadSimulation(scenario)
      const b = loadSimulation(scenario)
      const ra = expertNight(a)
      const rb = expertNight(b)
      expect(ra.finished).toBe(true)
      const scores = ra.scores()
      expect(scores.map((s) => `${s.id}:${String(s.over)}`)).toEqual([
        'the-pager:true',
        'still-bleeding:true',
        'the-slow-creep:true',
        'someone-helped:true',
      ])
      // The expert looks first, fixes through Git, takes no risks and reads the right cause.
      for (const s of scores) {
        expect(s.evidenceFirst, s.id).toBe(true)
        expect(s.gitops, s.id).toBe(true)
        expect(s.risky, s.id).toEqual([])
        expect(s.diagnosis?.correct, s.id).toBe(true)
        expect(s.hints, s.id).toBe(0)
      }
      // Acts follow one another: each starts when the one before ends.
      for (let i = 1; i < scores.length; i++)
        expect(scores[i]?.startedAt).toBe(scores[i - 1]?.endedAt)
      expect(JSON.stringify(ra.scores())).toBe(JSON.stringify(rb.scores()))
      expect(JSON.stringify(a.snapshot())).toBe(JSON.stringify(b.snapshot()))
    },
    120_000,
  )

  acTest(
    'E10-03.AC2',
    'a reckless playthrough fails gracefully, and the debrief says why each action was risky',
    () => {
      const sim = loadSimulation(scenario)
      const run = new CapstoneRun(sim)
      run.start()
      run.idle(6 * MIN)
      const sh = createShell(sim)
      const reckless = [
        // On staging, without checking.
        'kubectl delete pods --all',
        'kubectl config use-context prod',
        'kubectl delete deployment ravenpost-api -n ravenpost',
        'kubectl scale deployment gate -n ravenpost --replicas=0',
        'kubectl set image deployment/gate gate=registry.example/ravenpost/gate:latest -n ravenpost',
        'argocd app set ravenpost --sync-policy none',
        'kubectl delete namespace ravenpost',
      ]
      expect(() => {
        for (const c of reckless) {
          sh.run(c)
          run.record(c)
          run.idle(MIN)
        }
        run.idle(20 * MIN)
      }).not.toThrow()
      const s = run.scores()[0]
      expect(s?.over).toBe(false)
      expect(s?.evidenceFirst).toBe(false)
      expect(s?.gitops).toBe(false)
      const why = Object.fromEntries((s?.risky ?? []).map((r) => [r.command, r.why]))
      expect(Object.keys(why)).toEqual(reckless.filter((c) => !c.startsWith('kubectl config')))
      expect(why['kubectl delete namespace ravenpost']).toMatch(/deletes everything in it/)
      expect(why['kubectl scale deployment gate -n ravenpost --replicas=0']).toMatch(
        /takes the service down/,
      )
      expect(why['kubectl delete pods --all']).toMatch(/drops all their requests/)
      expect(why['argocd app set ravenpost --sync-policy none']).toMatch(/auto-sync off/)
      // One entry per command, though it deleted several pods (the audit records the command without flags).
      expect(s?.wrongContext).toEqual(['kubectl delete pods'])
      expect(s?.handChanges.length).toBeGreaterThan(3)
      // Hints are counted, and answering wrongly is recorded.
      expect(run.hint()).toMatch(/which cluster/)
      expect(run.diagnose('the-pager', 'node-down')).toBe(false)
      expect(run.scores()[0]).toMatchObject({
        hints: 1,
        diagnosis: { answer: 'node-down', correct: false },
      })
      expect(run.diagnose('nope', 'x')).toBe(false)
    },
    120_000,
  )

  acTest(
    'E10-03.AC3',
    'a snapshot taken in the middle of act 3 restores to the same simulation and telemetry',
    () => {
      const sim = loadSimulation(scenario)
      const run = expertNight(sim, 2)
      expect(run.actIndex).toBe(2)
      run.idle(4 * MIN)
      const restored = restoreSimulation(scenario, sim.snapshot())
      const again = new CapstoneRun(restored)
      again.start()
      expect(again.actIndex).toBe(2)
      for (const r of [run, again]) {
        r.record('kubectl get pods -n ravenpost')
        r.idle(5 * MIN)
      }
      expect(JSON.stringify(restored.snapshot())).toBe(JSON.stringify(sim.snapshot()))
      expect(JSON.stringify(rangeSeries(restored, 0, sim.now, 60_000))).toBe(
        JSON.stringify(rangeSeries(sim, 0, sim.now, 60_000)),
      )
      expect(again.history).toEqual(run.history)
    },
    120_000,
  )

  it('does nothing before start, and start is idempotent', () => {
    const sim = loadSimulation(scenario)
    const run = new CapstoneRun(sim)
    expect(run.current).toBeUndefined()
    expect(run.hint()).toBeUndefined()
    run.start()
    run.start()
    expect(run.actIndex).toBe(0)
    expect(run.current?.id).toBe('the-pager')
  })
})
