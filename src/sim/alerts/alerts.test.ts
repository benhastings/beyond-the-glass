import { describe, expect, it } from 'vitest'
import { acTest } from '@/test/ac'
import { instantQuery } from '../promql/evaluate'
import { windowSource } from '../dashboards/data'
import { telemetryScenario } from '../telemetry/testing'
import { EVAL_INTERVAL_MS, evaluateRules, RULES, type AlertState } from './rules'
import {
  BURN_ALERTS,
  budgetConsumed,
  burnAlertHolds,
  burnRate,
  DAY,
  errorBudget,
  HOUR,
  timeToExhaust,
} from './slo'

const MIN = 60_000

describe('E8-07 alerts and SLOs', () => {
  acTest(
    'E8-07.AC1',
    'alert states follow the rule expressions evaluated over the generated series',
    () => {
      // Errors start at the api at 20 minutes and stop at 32; ledger runs out of memory from 40.
      const { sim } = telemetryScenario([
        { at: '+20m', type: 'injectErrors', namespace: 'ravenpost', service: 'api', rate: 0.3 },
        { at: '+32m', type: 'injectErrors', namespace: 'ravenpost', service: 'api', rate: 0 },
        {
          at: '+40m',
          type: 'setMemoryLimit',
          namespace: 'ravenpost',
          deployment: 'ledger',
          container: 'ledger',
          limit: '128Mi',
        },
      ])
      sim.advance(60 * MIN)
      const got = evaluateRules(sim, 0, 60 * MIN)
      // The same thing, independently: an instant query at every evaluation, and `for` applied by hand.
      // One fetch of the window's series, shared by every instant query below.
      const src = windowSource(sim, -10 * MIN, 60 * MIN)
      for (const rule of RULES) {
        const expected: string[] = []
        const since = new Map<string, number>()
        const state = new Map<string, AlertState>()
        for (let t = -10 * MIN; t <= 60 * MIN; t += EVAL_INTERVAL_MS) {
          const v = instantQuery(src, rule.expr, t)
          const hits =
            v.kind === 'vector'
              ? v.samples.map((s) =>
                  JSON.stringify(
                    Object.entries(s.labels)
                      .filter(([k]) => k !== '__name__')
                      .sort(),
                  ),
                )
              : []
          for (const k of hits) {
            if (!since.has(k)) since.set(k, t)
            const next: AlertState = t - (since.get(k) ?? t) >= rule.forMs ? 'firing' : 'pending'
            if (state.get(k) !== next && t >= 0)
              expected.push(`${String(t)} ${k} ${state.get(k) ?? 'inactive'}→${next}`)
            state.set(k, next)
          }
          for (const k of [...state.keys()])
            if (!hits.includes(k)) {
              if (t >= 0) expected.push(`${String(t)} ${k} ${state.get(k) ?? ''}→inactive`)
              state.delete(k)
              since.delete(k)
            }
        }
        const actual = got.transitions
          .filter((x) => x.rule === rule.name)
          .map(
            (x) =>
              `${String(x.t)} ${JSON.stringify(Object.entries(x.labels).sort())} ${x.from}→${x.to}`,
          )
        expect(actual, rule.name).toEqual(expected)
      }
      // The story it tells: the error alert pends once the ratio crosses 5%, fires two minutes later, and
      // clears after the errors stop; ledger's outage pages too.
      const err = got.transitions.filter((x) => x.rule === 'RavenpostHighErrorRate')
      expect(err.map((x) => x.to)).toEqual(['pending', 'firing', 'inactive', 'pending', 'firing'])
      expect(err[0]?.t).toBeGreaterThanOrEqual(20 * MIN)
      expect((err[1]?.t ?? 0) - (err[0]?.t ?? 0)).toBe(2 * MIN)
      expect(err[2]?.t).toBeGreaterThan(32 * MIN)
      expect(got.active.map((a) => `${a.rule}:${a.state}`).sort()).toEqual(
        expect.arrayContaining([
          'RavenpostHighErrorRate:firing',
          'KubeDeploymentReplicasUnavailable:firing',
          'KubePodCrashLooping:firing',
        ]),
      )
      expect(
        got.active.find((a) => a.rule === 'KubeDeploymentReplicasUnavailable')?.labels.deployment,
      ).toBe('ledger')
    },
  )

  acTest(
    'E8-07.AC2',
    'burn-rate arithmetic, checked against the SRE workbook’s worked example',
    () => {
      // A 99.9% objective leaves 0.1% of requests as the budget.
      expect(errorBudget(0.999)).toBeCloseTo(0.001, 12)
      // 1.44% of requests failing burns it 14.4 times too fast…
      expect(burnRate(0.0144, 0.999)).toBeCloseTo(14.4, 9)
      // …which spends 2% of a 30-day budget in one hour, and all of it in 50 hours.
      expect(budgetConsumed(14.4, HOUR, 30 * DAY)).toBeCloseTo(0.02, 12)
      expect(timeToExhaust(14.4, 30 * DAY)).toBeCloseTo(50 * HOUR, 6)
      // The six-hour page: a burn of 6 spends 5% in six hours; the three-day ticket, 10% in three days.
      expect(budgetConsumed(6, 6 * HOUR)).toBeCloseTo(0.05, 12)
      expect(budgetConsumed(1, 3 * DAY)).toBeCloseTo(0.1, 12)
      expect(BURN_ALERTS.map((a) => a.threshold)).toEqual([14.4, 6, 1])
      // Both windows must burn fast: a spike that's over (short window calm) doesn't page.
      const page = BURN_ALERTS[0]
      expect(burnAlertHolds(page, 0.02, 0.02, 0.999)).toBe(true)
      expect(burnAlertHolds(page, 0.02, 0.001, 0.999)).toBe(false)
      expect(burnAlertHolds(page, 0.001, 0.05, 0.999)).toBe(false)
      expect(timeToExhaust(0)).toBe(Infinity)
    },
  )

  it('a healthy hour fires nothing', () => {
    const { sim } = telemetryScenario()
    sim.advance(60 * MIN)
    expect(evaluateRules(sim, 0, 60 * MIN)).toEqual({ transitions: [], active: [] })
  })
})
