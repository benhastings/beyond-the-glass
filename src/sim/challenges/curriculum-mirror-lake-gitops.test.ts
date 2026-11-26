import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect } from 'vitest'
import { CHALLENGES } from '@/challenges'
import { SCENARIOS } from '@/scenarios'
import { FRAGMENT_SCENARIOS, FRAGMENT_TARGET } from '@/scenarios/fragments'
import { acTest } from '@/test/ac'
import { createShell } from '../commands'
import { loadSimulation } from '../controllers'
import { fragment, playExpertPath } from '../gitops/fragments'
import { attach, ChallengeRun, playChallengePath } from './engine'

const DIR = join(import.meta.dirname, '../../../content/regions/mirror-lake/gitops')
const lessons = readdirSync(DIR)
  .filter((f) => f.endsWith('.mdx'))
  .map((f) => readFileSync(join(DIR, f), 'utf8'))
  .join('\n')

function start(challengeId: string) {
  const c = CHALLENGES[challengeId]
  const scenario = c && SCENARIOS[c.scenario]
  if (!c || !scenario) throw new Error(`missing ${challengeId}`)
  const sim = loadSimulation(scenario)
  const session = { history: [] as string[] }
  const sh = createShell(sim, session)
  const run = new ChallengeRun(sim, c, session.history)
  attach(run, session)
  return { c, sim, sh, run }
}

describe('E9-08 Mirror Lake II', () => {
  acTest(
    'E9-08.AC1',
    'a challenge for each of the four GitOps fragments, each solved by its expert path',
    () => {
      const byScenario = Object.values(CHALLENGES).filter((c) => c.scenario in FRAGMENT_SCENARIOS)
      expect(byScenario.map((c) => c.scenario).sort()).toEqual(
        Object.keys(FRAGMENT_SCENARIOS).sort(),
      )
      for (const c of byScenario) {
        const spec = FRAGMENT_SCENARIOS[c.scenario as keyof typeof FRAGMENT_SCENARIOS]
        const f = fragment(spec.fragment)
        if (!f) throw new Error(spec.fragment)
        const p = f.params.parse({ ...FRAGMENT_TARGET, ...spec.params })
        // The challenge is in a lesson, and it's solved exactly when the fragment is.
        expect(lessons, c.id).toContain(`scenario="${c.scenario}" challenge="${c.id}"`)
        expect(
          c.objectives.map((o) => o.check),
          c.id,
        ).toContainEqual(f.solved(p))
        // Its expert path completes it…
        const { sim, sh, run } = start(c.id)
        expect(run.evaluate().complete, `${c.id} before`).toBe(false)
        playChallengePath(sim, sh, c.expertPath)
        expect(run.evaluate().complete, c.id).toBe(true)
        // …and so does each of the fragment's own expert paths, in this scenario.
        for (const path of f.expertPaths(p)) {
          const s2 = start(c.id)
          const history = playExpertPath(s2.sim, path.steps)
          const solved = new ChallengeRun(s2.sim, c, history).check(f.solved(p))
          expect(solved, `${c.id}: ${path.name}`).toBe(true)
        }
      }
    },
    120_000,
  )

  acTest(
    'E9-08.AC2',
    'fixing it with kubectl only is spotted and explained, and redoing it through Git completes it',
    () => {
      const { sim, sh, run } = start('make-it-stick')
      sh.run('argocd app get ravenpost')
      sh.run('kubectl scale deployment/gate -n ravenpost --replicas=4')
      let e = run.evaluate()
      expect(e.warnings.join(' ')).toMatch(/self-heal will put it back[\s\S]*merge request/)
      // Self-heal reverts it, so the objective isn't met: coached, not failed.
      sim.advance(4 * 60_000)
      e = run.evaluate()
      expect(e.objectives.find((o) => o.id === 'four')?.done).toBe(false)
      expect(e.complete).toBe(false)
      playChallengePath(sim, sh, [
        {
          mr: {
            repo: 'ravenpost-deploy',
            file: 'prod/deployment-gate.yaml',
            replace: ['replicas: 2', 'replicas: 4'],
            message: 'Scale gate to 4',
          },
        },
        { wait: '+3m' },
      ])
      e = run.evaluate()
      expect(e.complete).toBe(true)
      expect(e.warnings.length).toBe(1)
    },
    60_000,
  )
})
