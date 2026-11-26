import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect } from 'vitest'
import { CHALLENGES } from '@/challenges'
import { SCENARIOS } from '@/scenarios'
import { acTest } from '@/test/ac'
import { createShell } from '../commands'
import { loadSimulation } from '../controllers'
import { tracesInWindow } from '../telemetry/traces'
import { attach, ChallengeRun, playChallengePath } from './engine'

const DIR = join(import.meta.dirname, '../../../content/regions/signalwood/traces-and-logs')
const read = (id: string) => readFileSync(join(DIR, `${id}.mdx`), 'utf8')
const all = readdirSync(DIR)
  .filter((f) => f.endsWith('.mdx'))
  .map((f) => readFileSync(join(DIR, f), 'utf8'))
  .join('\n')

function start(id: string) {
  const c = CHALLENGES[id]
  const scenario = c && SCENARIOS[c.scenario]
  if (!c || !scenario) throw new Error(id)
  const sim = loadSimulation(scenario)
  const session = { history: [] as string[] }
  const sh = createShell(sim, session)
  const run = new ChallengeRun(sim, c, session.history)
  attach(run, session)
  return { c, sim, sh, run }
}

describe('E9-10 Signalwood II', () => {
  acTest(
    'E9-10.AC1',
    'challenge: from a latency regression, name the service and operation responsible and the log line that explains it',
    () => {
      expect(all).toContain('scenario="slow-ledger" challenge="slow-request" view="observability"')
      const { c, sim, sh, run } = start('slow-request')
      // The slowest recent gate requests spend their time in the ledger's POST /entries.
      const slow = tracesInWindow(sim, sim.now - 10 * 60_000, sim.now)
        .filter((t) => t.rootService === 'gate')
        .sort((a, b) => b.durationMs - a.durationMs)
        .slice(0, 3)
      expect(slow.length).toBe(3)
      for (const t of slow) {
        const own = t.spans.map((s) => ({
          s,
          own:
            s.end -
            s.start -
            t.spans
              .filter((x) => x.parentSpanId === s.spanId)
              .reduce((n, x) => n + x.end - x.start, 0),
        }))
        const top = own.sort((a, b) => b.own - a.own)[0]?.s
        expect(`${top?.service ?? ''} ${top?.name ?? ''}`).toBe('ledger POST /entries')
      }
      expect(sh.run('kubectl logs deploy/ledger -n ravenpost | grep warn').stdout).toMatch(
        /batch lookups enabled/,
      )
      sh.run('answer service postgres')
      expect(run.evaluate().objectives.find((o) => o.id === 'service')?.done).toBe(false)
      playChallengePath(sim, sh, c.expertPath)
      expect(run.evaluate().complete).toBe(true)
    },
    60_000,
  )

  acTest(
    'E9-10.AC2',
    'challenge: diagnose traces broken by a service that doesn’t propagate context',
    () => {
      const lesson = read('context-propagation')
      expect(lesson).toContain('<OtelPipeline />')
      expect(lesson).toContain('scenario="broken-traces" challenge="broken-traces"')
      const { c, sim, sh, run } = start('broken-traces')
      const traces = tracesInWindow(sim, sim.now - 5 * 60_000, sim.now)
      const fromGate = traces.filter((t) => t.rootService === 'gate')
      expect(fromGate.length).toBeGreaterThan(0)
      // Traces end at the api; the ledger and the queue start traces of their own, with no parent.
      for (const t of fromGate)
        expect(t.spans.map((s) => s.service).sort()).toEqual(['gate', 'ravenpost-api'])
      const orphans = traces.filter((t) => t.rootService === 'ledger')
      expect(orphans.length).toBe(fromGate.length)
      for (const t of orphans)
        expect(t.spans.find((s) => s.service === 'ledger')?.parentSpanId).toBeUndefined()
      sh.run('answer where ledger')
      expect(run.evaluate().complete).toBe(false)
      playChallengePath(sim, sh, c.expertPath)
      expect(run.evaluate().complete).toBe(true)
    },
    60_000,
  )
})
