import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect } from 'vitest'
import { parse } from 'yaml'
import { CHALLENGES } from '@/challenges'
import { SCENARIOS } from '@/scenarios'
import { acTest } from '@/test/ac'
import { createShell } from '../commands'
import { loadSimulation } from '../controllers'
import { attach, ChallengeRun } from './engine'
import type { Predicate } from './schema'

const DIR = join(import.meta.dirname, '../../../content/regions/chartroom/triage')
const mdx = (id: string) => readFileSync(join(DIR, `${id}.mdx`), 'utf8')
const MINI: [challenge: string, lesson: string][] = [
  ['triage-crashloop', 'triage-flow'],
  ['triage-imagepull', 'pulls-and-config'],
  ['triage-config', 'pulls-and-config'],
  ['triage-oom', 'resources-and-scheduling'],
  ['triage-pending', 'resources-and-scheduling'],
  ['triage-not-ready', 'not-ready'],
]
const challenge = (id: string) => {
  const c = CHALLENGES[id]
  if (!c) throw new Error(`no challenge ${id}`)
  return c
}

describe('E9-06 the Chartroom II', () => {
  acTest(
    'E9-06.AC1',
    'each mini-scenario has the learner state the root cause before the fix counts',
    () => {
      for (const [id, lesson] of MINI) {
        const c = challenge(id)
        const objectives = c.objectives.map((o) => o.check)
        const cause = objectives.find(
          (p): p is Extract<Predicate, { type: 'answered' }> => p.type === 'answered',
        )
        expect(cause, id).toBeDefined()
        const fix = c.objectives.at(-1)?.check
        expect(fix?.type, id).toBe('all')
        expect(fix?.type === 'all' && fix.of.some((p) => p.type === 'answered'), id).toBe(true)
        // In the lesson, the challenge comes before the step that shows the fix.
        const text = mdx(lesson)
        const at = text.indexOf(`challenge="${id}"`)
        expect(at, id).toBeGreaterThan(0)
        expect(text.indexOf('title="The fix"', at), id).toBeGreaterThan(at)
      }
      // Fixing it without saying why doesn't complete the fix.
      const c = challenge('triage-imagepull')
      const scenario = SCENARIOS[c.scenario]
      if (!scenario) throw new Error('no triage scenario')
      const sim = loadSimulation(scenario)
      const session = { history: [] as string[] }
      const sh = createShell(sim, session)
      const run = new ChallengeRun(sim, c, session.history)
      attach(run, session)
      sh.run(
        'kubectl set image deploy/ravenpost-web web=registry.example/ravenpost/web:2.3.2 -n ravenpost',
      )
      sh.run('kubectl rollout status deploy/ravenpost-web -n ravenpost')
      const before = run.evaluate().objectives.find((o) => o.id === 'fix')
      expect(before?.done).toBe(false)
      sh.run('answer cause the tag v2.3.2 does not exist')
      expect(run.evaluate().objectives.find((o) => o.id === 'fix')?.done).toBe(true)
    },
  )

  acTest(
    'E9-06.AC2',
    'fixes use kubectl, with a callout that the real fix goes through Git (Mirror Lake)',
    () => {
      for (const [id] of MINI) {
        const c = challenge(id)
        expect(
          c.expertPath.every((l) => /^(kubectl|answer)\s/.test(l)),
          id,
        ).toBe(true)
        expect(
          c.objectives.some(
            (o) => o.check.type === 'mergedRequest' || o.check.type === 'changedVia',
          ),
          id,
        ).toBe(false)
      }
      for (const lesson of new Set(MINI.map(([, l]) => l))) {
        const fixes = mdx(lesson)
          .split('<Step ')
          .filter((s) => s.includes('title="The fix"'))
        expect(fixes.length, lesson).toBeGreaterThan(0)
        for (const f of fixes)
          expect(f, lesson).toMatch(/the real fix goes through Git[\s\S]*Mirror Lake/)
      }
    },
  )

  acTest('E9-06.AC3', 'an ordering check holds the triage flow in sequence', () => {
    const file = parse(readFileSync(join(DIR, 'triage-flow.checks.yaml'), 'utf8')) as {
      checks: { id: string; type: string; items?: { id: string }[] }[]
    }
    const order = file.checks.find((c) => c.id === 'triage-order')
    expect(order?.type).toBe('ordering')
    expect(order?.items?.map((i) => i.id)).toEqual([
      'context',
      'get',
      'describe',
      'events',
      'logs',
      'changes',
    ])
    expect(mdx('triage-flow')).toMatch(/<Check id="triage-order" \/>/)
  })
})
