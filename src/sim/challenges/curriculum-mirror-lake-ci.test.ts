import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect } from 'vitest'
import { CHALLENGES } from '@/challenges'
import { SCENARIOS } from '@/scenarios'
import { acTest } from '@/test/ac'
import { createShell } from '../commands'
import { loadSimulation } from '../controllers'
import { pipelines } from '../gitops/pipeline'
import { attach, ChallengeRun } from './engine'

const DIR = join(import.meta.dirname, '../../../content/regions/mirror-lake/commit-to-image')
const mdx = (id: string) => readFileSync(join(DIR, `${id}.mdx`), 'utf8')

describe('E9-07 Mirror Lake I', () => {
  acTest(
    'E9-07.AC1',
    'challenge: from the pipeline view, say which job failed and why, and which tag (if any) was produced',
    () => {
      expect(mdx('when-a-pipeline-fails')).toMatch(
        /<Terminal scenario="pipelines" challenge="read-the-pipelines" view="pipelines" required \/>/,
      )
      const c = CHALLENGES['read-the-pipelines']
      const scenario = SCENARIOS['pipelines']
      if (!c || !scenario) throw new Error('missing')
      expect(c.questions.map((q) => q.id)).toEqual(['job', 'why', 'tag'])
      const sim = loadSimulation(scenario)
      // What the view shows is what the answers expect.
      const [, tests, scan] = pipelines(sim)
      expect(tests?.jobs.find((j) => j.status === 'failed')?.name).toBe('unit-tests')
      expect(
        tests?.jobs
          .find((j) => j.name === 'unit-tests')
          ?.sections.flatMap((s) => s.lines)
          .join('\n'),
      ).toMatch(/expected 500 to be 404/)
      expect(scan?.jobs.find((j) => j.status === 'failed')?.name).toBe('image-scan')
      expect(scan?.image).toBeUndefined()
      expect(scan?.jobs.find((j) => j.name === 'push-image')?.status).toBe('skipped')
      // Wrong answers don't count; the right ones complete it.
      const session = { history: [] as string[] }
      const sh = createShell(sim, session)
      const run = new ChallengeRun(sim, c, session.history)
      attach(run, session)
      sh.run('answer job image-scan')
      sh.run('answer tag 34298e12')
      expect(run.evaluate().objectives.filter((o) => o.done)).toEqual([])
      for (const line of c.expertPath) sh.run(line)
      expect(run.evaluate().complete).toBe(true)
    },
  )

  acTest(
    'E9-07.AC2',
    'an analogy: a merge request is a change request with automatic peer review and an audit trail',
    () => {
      const now = /<Analogy[\s\S]*?now="([^"]+)"/.exec(mdx('git-for-operators'))?.[1] ?? ''
      const then = /<Analogy[\s\S]*?then="([^"]+)"/.exec(mdx('git-for-operators'))?.[1] ?? ''
      expect(then).toMatch(/change request/i)
      expect(now).toMatch(/merge request/i)
      expect(now).toMatch(/automatic checks/i)
      expect(now).toMatch(/peer review/i)
      expect(now).toMatch(/audit trail/i)
    },
  )
})
