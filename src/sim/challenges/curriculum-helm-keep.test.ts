import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect } from 'vitest'
import { CHALLENGES } from '@/challenges'
import { SCENARIOS } from '@/scenarios'
import { acTest } from '@/test/ac'
import { createShell } from '../commands'
import { loadSimulation } from '../controllers'
import { attach, ChallengeRun } from './engine'

const LESSONS = join(import.meta.dirname, '../../../content/regions/helm-keep/anatomy')
const lesson = (id: string) => readFileSync(join(LESSONS, `${id}.mdx`), 'utf8')

/** Plays a challenge's expert path in a fresh simulation; returns whether it completed, and the output. */
function solve(id: string) {
  const c = CHALLENGES[id]
  const scenario = c && SCENARIOS[c.scenario]
  if (!c || !scenario) throw new Error(`no challenge ${id}`)
  const sim = loadSimulation(scenario)
  const session = { history: [] as string[] }
  const sh = createShell(sim, session)
  const run = new ChallengeRun(sim, c, session.history)
  attach(run, session)
  const out = c.expertPath.map((line) => sh.run(line).stdout).join('\n')
  return { complete: run.evaluate().complete, out }
}

describe('E9-03 Helm Keep I', () => {
  acTest(
    'E9-03.AC1',
    'challenges: an app’s pods by label, the node a pod runs on (-o wide), and the pods in a namespace',
    () => {
      expect(lesson('namespaces-and-labels')).toMatch(
        /<Terminal scenario="ravenpost" challenge="pods-by-label"/,
      )
      expect(lesson('pods')).toMatch(/<Terminal scenario="ravenpost" challenge="which-node"/)
      expect(lesson('namespaces-and-labels')).toMatch(
        /<Terminal scenario="ravenpost" challenge="count-system-pods"/,
      )
      const label = solve('pods-by-label')
      expect(label.complete).toBe(true)
      expect(label.out.match(/^ravenpost-worker-\S+/gm)).toHaveLength(4) // --show-labels, then -l: two each
      const node = solve('which-node')
      expect(node.complete).toBe(true)
      expect(node.out).toMatch(/^ravenpost-notifier-.*\sravenpost-worker2\s/m)
      const count = solve('count-system-pods')
      expect(count.complete).toBe(true)
      expect(count.out.trim().split('\n')[0]).toBe('12')
      // A wrong answer doesn't count.
      const c = CHALLENGES['which-node']
      const scenario = SCENARIOS['ravenpost']
      if (!c || !scenario) throw new Error('missing')
      const sim = loadSimulation(scenario)
      const session = { history: [] as string[] }
      const sh = createShell(sim, session)
      const run = new ChallengeRun(sim, c, session.history)
      attach(run, session)
      sh.run('kubectl get pods -n ravenpost -o wide')
      sh.run('answer node ravenpost-worker')
      expect(run.evaluate().complete).toBe(false)
    },
  )

  acTest(
    'E9-03.AC2',
    'the cluster anatomy diagram is a <Diagram> with alt text, rendered to SVG',
    () => {
      const text = lesson('keep-and-stewards')
      const alt = /<Diagram alt="([^"]+)">/.exec(text)?.[1] ?? ''
      expect(alt).toMatch(/API server/)
      expect(alt).toMatch(/etcd/)
      expect(alt).toMatch(/kubelet/)
      expect(alt.length).toBeGreaterThan(80)
      expect(text).toMatch(/```mermaid\nflowchart/)
    },
  )
})
