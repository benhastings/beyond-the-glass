import { describe, expect } from 'vitest'
import { SCENARIOS } from '@/scenarios'
import { acTest } from '@/test/ac'
import { evaluateRules } from '../alerts/rules'
import { createShell } from '../commands'
import { loadSimulation } from '../controllers'
import { parseDuration } from '../core/duration'
import type { Simulator } from '../core/simulator'
import { compareApp } from '../gitops/argo'
import { playExpertPath } from '../gitops/fragments/define'
import { instantQuery } from '../promql/evaluate'
import { telemetrySource } from '../promql/source'
import { containerHistories } from '../telemetry/history'
import { rangeSeries } from '../telemetry/metrics'
import { tracesInWindow } from '../telemetry/traces'
import { actsOf, actSolved, startAct, type Act } from './script'

const MIN = 60_000
const scenario = SCENARIOS['the-long-night']
if (!scenario) throw new Error('no the-long-night scenario')

const value = (sim: Simulator, q: string) => {
  const v = instantQuery(telemetrySource(sim), q, sim.now)
  return v.kind === 'vector' ? (v.samples[0]?.value ?? NaN) : NaN
}
const gate5xx = (sim: Simulator) =>
  value(
    sim,
    'sum(rate(http_server_requests_total{service="gate", http_response_status_code=~"5.."}[2m])) / sum(rate(http_server_requests_total{service="gate"}[2m]))',
  )

/** Plays one act: starts it, lets its trouble show, checks it, plays the expert path until it's over. */
function play(sim: Simulator, act: Act, symptoms: (sh: ReturnType<typeof createShell>) => void) {
  const started = sim.now
  startAct(sim, act)
  sim.advance(parseDuration(act.minDuration))
  expect(actSolved(sim, act, started), `${act.id} is not over before anything is done`).toBe(false)
  const sh = createShell(sim)
  sh.run('kubectl config use-context prod')
  symptoms(sh)
  const history = playExpertPath(sim, act.expertPath)
  for (let i = 0; i < 20 && !actSolved(sim, act, started, history); i++) sim.advance(MIN)
  expect(actSolved(sim, act, started, history), `${act.id} is over after its expert path`).toBe(
    true,
  )
  return sh
}

describe('E10-02 The Long Night', () => {
  acTest(
    ['E10-02.AC1', 'E10-02.AC3'],
    'all four acts: every failure mode shows, consistently in every signal, and the expert path ends each one',
    () => {
      const acts = actsOf(scenario)
      expect(acts.map((a) => a.id)).toEqual([
        'the-pager',
        'still-bleeding',
        'the-slow-creep',
        'someone-helped',
      ])
      const sim = loadSimulation(scenario)
      expect(createShell(sim).run('kubectl config current-context').stdout).toBe('stage')
      const [pager, bleeding, creep, helped] = acts as [Act, Act, Act, Act]

      // Act 1: ImagePullBackOff, a stalled rollout, Argo Degraded/Progressing, the page.
      play(sim, pager, (sh) => {
        expect(sh.run('kubectl get pods -n ravenpost').stdout).toMatch(
          /ravenpost-api-\S+\s+0\/1\s+(ErrImagePull|ImagePullBackOff)/,
        )
        expect(sh.run('kubectl get events -n ravenpost').stdout).toMatch(
          /Failed to pull image "registry\.example\/ravenpost\/api:v1\.15\.0"/,
        )
        expect(
          value(sim, 'kube_deployment_status_replicas_available{deployment="ravenpost-api"}'),
        ).toBe(0)
        expect(gate5xx(sim)).toBeGreaterThan(0.9)
        const t = tracesInWindow(sim, sim.now - MIN, sim.now).filter(
          (x) => x.rootService === 'gate',
        )
        expect(t.length).toBeGreaterThan(0)
        expect(
          t.every((x) =>
            x.spans.some(
              (s) =>
                s.service === 'ravenpost-api' &&
                s.status.message === 'no endpoints available for service "ravenpost-api"',
            ),
          ),
        ).toBe(true)
        expect(['Progressing', 'Degraded']).toContain(compareApp(sim, 'ravenpost')?.health)
        expect(
          evaluateRules(sim, sim.now - 10 * MIN, sim.now).active.map((a) => `${a.rule}:${a.state}`),
        ).toEqual(
          expect.arrayContaining([
            'RavenpostHighErrorRate:firing',
            'KubeDeploymentReplicasUnavailable:firing',
          ]),
        )
      })

      // Act 2: CrashLoopBackOff from missing config; --previous shows why.
      play(sim, bleeding, (sh) => {
        expect(sh.run('kubectl get pods -n ravenpost').stdout).toMatch(
          /ravenpost-api-\S+\s+0\/1\s+(CrashLoopBackOff|Error)\s+[1-9]/,
        )
        expect(sh.run('kubectl logs deploy/ravenpost-api -n ravenpost --previous').stdout).toMatch(
          /missing required config key LEDGER_BATCH_SIZE/,
        )
        expect(
          value(sim, 'sum(kube_pod_container_status_restarts_total{pod=~"ravenpost-api-.*"})'),
        ).toBeGreaterThan(0)
        expect(gate5xx(sim)).toBeGreaterThan(0.9)
      })
      // Recovered: once the two-minute window has cleared, the gate is quiet again.
      sim.advance(3 * MIN)
      expect(gate5xx(sim)).toBeLessThan(0.01)

      // Act 3: latency behind a flag (traces), OOMKilled (the E8-01 contract), a red herring.
      play(sim, creep, (sh) => {
        expect(
          value(
            sim,
            'histogram_quantile(0.99, sum by (le) (rate(http_server_request_duration_seconds_bucket{service="ledger"}[5m])))',
          ),
        ).toBeGreaterThan(0.5)
        const slow = tracesInWindow(sim, sim.now - 2 * MIN, sim.now).filter(
          (x) => x.rootService === 'gate',
        )
        expect(
          slow.every((x) => {
            const ledger = x.spans.find((s) => s.service === 'ledger')
            return ledger !== undefined && ledger.end - ledger.start > x.durationMs * 0.5
          }),
        ).toBe(true)
        const h = containerHistories(sim).find(
          (x) => x.deployment === 'scribe' && x.runs.some((r) => r.reason === 'OOMKilled'),
        )
        expect(h?.limit).toBe(128 * 1024 ** 2)
        const kill = h?.runs.find((r) => r.reason === 'OOMKilled')?.end ?? 0
        const mem = rangeSeries(sim, kill - MIN, sim.now, 15_000, [
          'container_memory_working_set_bytes',
        ]).find((s) => s.labels.pod === h?.pod)
        expect(mem?.points.find(([t]) => t >= kill)?.[1]).toBe(128 * 1024 ** 2)
        expect(sh.run(`kubectl describe pod ${h?.pod ?? ''} -n ravenpost`).stdout).toMatch(
          /Reason: +OOMKilled/,
        )
        expect(sh.run('kubectl get events -A').stdout).toMatch(/NodeHasDiskPressure/)
      })

      // Act 4: drift put back by self-heal; Git wrong too; not Ready → no endpoints → 503s.
      play(sim, helped, (sh) => {
        expect(sh.run('kubectl get endpoints gate -n ravenpost').stdout).toMatch(/^gate\s+<none>/m)
        expect(sh.run('kubectl get events -n ravenpost').stdout).toMatch(
          /Readiness probe failed: HTTP probe failed with statuscode: 404/,
        )
        expect(sh.run('kubectl get events -n argocd').stdout).toMatch(
          /OperationStarted\s+application\/ravenpost\s+Initiated automated sync/,
        )
        expect(value(sim, 'kube_deployment_status_replicas_available{deployment="gate"}')).toBe(0)
        expect(gate5xx(sim)).toBeGreaterThan(0.9)
      })
      // The night is over: quiet again.
      sim.advance(10 * MIN)
      expect(gate5xx(sim)).toBeLessThan(0.01)
      expect(compareApp(sim, 'ravenpost')).toMatchObject({ sync: 'Synced', health: 'Healthy' })
    },
    120_000,
  )
})
