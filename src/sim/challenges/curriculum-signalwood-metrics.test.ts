import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect } from 'vitest'
import { CHALLENGES } from '@/challenges'
import { SCENARIOS } from '@/scenarios'
import { acTest } from '@/test/ac'
import { createShell } from '../commands'
import { loadSimulation } from '../controllers'
import { instantQuery } from '../promql/evaluate'
import { telemetrySource } from '../promql/source'
import { attach, ChallengeRun, playChallengePath } from './engine'

const DIR = join(import.meta.dirname, '../../../content/regions/signalwood/metrics')
const mdx = readdirSync(DIR)
  .filter((f) => f.endsWith('.mdx'))
  .map((f) => readFileSync(join(DIR, f), 'utf8'))
const scenario = SCENARIOS['signals']
if (!scenario) throw new Error('no signals scenario')

function solve(id: string) {
  const c = CHALLENGES[id]
  if (!c) throw new Error(id)
  const sim = loadSimulation(scenario as NonNullable<typeof scenario>)
  const session = { history: [] as string[] }
  const sh = createShell(sim, session)
  const run = new ChallengeRun(sim, c, session.history)
  attach(run, session)
  return { c, sim, sh, run }
}

describe('E9-09 Signalwood I', () => {
  acTest(
    'E9-09.AC1',
    'challenges: when the error rate spiked and the deploy annotation before it; a p99 latency query by service',
    () => {
      const all = mdx.join('\n')
      expect(all).toContain('scenario="signals" challenge="when-did-it-break" view="dashboards"')
      expect(all).toContain('scenario="signals" challenge="p99-by-service" view="promql"')
      // The scenario really shows a sync at 20:45 and the errors climbing right after it.
      const { sim, sh, run, c } = solve('when-did-it-break')
      expect(sh.run('argocd app history ravenpost').stdout).toMatch(
        /20:45:00 \+0000 UTC\s+main \(78c2023\)/,
      )
      const ratio = (minute: number) => {
        const v = instantQuery(
          telemetrySource(sim),
          'sum(rate(http_server_requests_total{service="ravenpost-api", http_response_status_code=~"5.."}[5m])) / sum(rate(http_server_requests_total{service="ravenpost-api"}[5m]))',
          minute * 60_000,
        )
        return v.kind === 'vector' ? (v.samples[0]?.value ?? 0) : 0
      }
      expect(ratio(44)).toBeLessThan(0.005)
      expect(ratio(50)).toBeGreaterThan(0.05)
      sh.run('answer when 19:30')
      expect(run.evaluate().objectives.find((o) => o.id === 'when')?.done).toBe(false)
      playChallengePath(sim, sh, c.expertPath)
      expect(run.evaluate().complete).toBe(true)
      // The p99 query: a wrong one doesn't count, the right one does.
      const q = solve('p99-by-service')
      q.sh.run(
        'answer query histogram_quantile(0.99, sum by (service) (rate(http_server_request_duration_seconds_bucket[5m])))',
      )
      expect(q.run.evaluate().complete).toBe(false)
      playChallengePath(q.sim, q.sh, q.c.expertPath)
      expect(q.run.evaluate().complete).toBe(true)
    },
    60_000,
  )

  acTest(
    'E9-09.AC2',
    'every PromQL example in the module runs in the explorer, and returns series',
    () => {
      const examples = mdx.flatMap((t) =>
        [...t.matchAll(/<CodeBlock\s+language="promql"[\s\S]*?code=\{`([\s\S]*?)`\}/g)].map(
          (m) => m[1] ?? '',
        ),
      )
      const answer = CHALLENGES['p99-by-service']?.expertPath[0]
      if (typeof answer === 'string') examples.push(answer.replace(/^answer query /, ''))
      expect(examples.length).toBeGreaterThanOrEqual(6)
      const sim = loadSimulation(scenario)
      for (const q of examples) {
        const v = instantQuery(telemetrySource(sim), q, sim.now)
        expect(v.kind, q).toBe('vector')
        expect(v.kind === 'vector' && v.samples.length > 0, q).toBe(true)
      }
    },
  )
})
