import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect } from 'vitest'
import { CHALLENGES } from '@/challenges'
import { SCENARIOS } from '@/scenarios'
import { acTest } from '@/test/ac'
import { createShell } from '../commands'
import { loadSimulation } from '../controllers'
import { parse } from 'yaml'
import { attach, ChallengeRun } from './engine'

const REGION = join(import.meta.dirname, '../../../content/regions/helm-keep')
const lesson = (id: string, module = 'anatomy') =>
  readFileSync(join(REGION, module, `${id}.mdx`), 'utf8')

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
  const out = c.expertPath
    .map((line) => (typeof line === 'string' ? sh.run(line).stdout : ''))
    .join('\n')
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

describe('E9-04 Helm Keep II', () => {
  acTest(
    'E9-04.AC1',
    'challenges: delete a pod and see it replaced, scale a Deployment, trace a Service to its endpoints, watch a rolling update',
    () => {
      const placed = (id: string, l: string) => {
        expect(lesson(l, 'workloads')).toMatch(
          new RegExp(`<Terminal scenario="ravenpost" challenge="${id}"`),
        )
      }
      placed('replace-a-pod', 'reconciliation')
      placed('scale-the-worker', 'reconciliation')
      placed('roll-out-web', 'reconciliation')
      placed('trace-a-service', 'services')
      const replaced = solve('replace-a-pod')
      expect(replaced.complete).toBe(true)
      // The pod that was deleted isn't in the last listing; a new one is.
      const last = replaced.out.split('pod "ravenpost-web-74d9fdfcd5-252jk" deleted').at(-1) ?? ''
      expect(last).not.toMatch(/ravenpost-web-74d9fdfcd5-252jk/)
      expect(last.match(/^ravenpost-web-\S+\s+1\/1\s+Running/gm)).toHaveLength(2)
      const scaled = solve('scale-the-worker')
      expect(scaled.complete).toBe(true)
      expect(scaled.out).toMatch(/successfully rolled out/)
      const traced = solve('trace-a-service')
      expect(traced.complete).toBe(true)
      expect(traced.out).toMatch(/^ravenpost-api\s+(\d+\.\d+\.\d+\.\d+:8080,?){3}/m)
      const rolled = solve('roll-out-web')
      expect(rolled.complete).toBe(true)
      expect(rolled.out).toMatch(/Waiting for deployment "ravenpost-web" rollout to finish/)
      expect(rolled.out).toMatch(/^2\s/m)
    },
  )

  acTest(
    'E9-04.AC2',
    'the probes lesson has a spot-the-bug readiness probe check, on the wrong path',
    () => {
      expect(lesson('probes-and-resources', 'workloads')).toMatch(/<Check id="probes-bug" \/>/)
      const file = parse(
        readFileSync(join(REGION, 'workloads/probes-and-resources.checks.yaml'), 'utf8'),
      ) as { checks: { id: string; type: string; code: string; bugLines: number[] }[] }
      const bug = file.checks.find((c) => c.id === 'probes-bug')
      expect(bug?.type).toBe('spot-the-bug')
      const lines = bug?.code.split('\n') ?? []
      expect(lines[(bug?.bugLines[0] ?? 0) - 1]).toMatch(/path: \/readyz/)
      expect(bug?.code).toMatch(/readinessProbe:/)
    },
  )
})
