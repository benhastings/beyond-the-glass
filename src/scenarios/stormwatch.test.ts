import { describe, expect } from 'vitest'
import { acTest } from '@/test/ac'
import { evaluateRules } from '@/sim/alerts/rules'
import { createShell } from '@/sim/commands'
import { loadSimulation } from '@/sim/controllers'
import { compareApp, applications } from '@/sim/gitops/argo'
import { instantQuery } from '@/sim/promql/evaluate'
import { telemetrySource } from '@/sim/promql/source'
import { tracesInWindow } from '@/sim/telemetry/traces'
import stormwatch from '@/scenarios/stormwatch.yaml'

const H = 3_600_000

describe('E10-01 Ravenpost reference system', () => {
  acTest('E10-01.AC1', 'six hours of the baseline: every signal green, no alerts', () => {
    const sim = loadSimulation(stormwatch)
    sim.advance(6 * H)
    // No alert so much as went pending.
    expect(evaluateRules(sim, 0, 6 * H)).toEqual({ transitions: [], active: [] })
    // Every Deployment is fully available on both clusters, and no pod restarted.
    for (const c of ['prod', 'stage']) {
      const cluster = sim.clusterByName(c)
      for (const d of cluster?.list('Deployment') ?? [])
        expect(d.status.availableReplicas, `${c}/${d.metadata.name}`).toBe(d.spec.replicas)
      for (const p of cluster?.list('Pod') ?? [])
        expect(p.status.containerStatuses?.[0]?.restartCount, p.metadata.name).toBe(0)
    }
    // Argo CD: every application in sync and healthy, deployed from Git (mirrored from the manifests).
    expect(applications(sim).map((a) => a.name)).toEqual(['ravenpost', 'ravenpost-stage'])
    for (const a of applications(sim))
      expect(compareApp(sim, a.name), a.name).toMatchObject({ sync: 'Synced', health: 'Healthy' })
    // The SLO holds: 99.9% of the gate's requests succeed, p99 well under 500 ms.
    const src = telemetrySource(sim)
    const v = (q: string) => {
      const r = instantQuery(src, q, 6 * H)
      return r.kind === 'vector' ? (r.samples[0]?.value ?? NaN) : NaN
    }
    expect(
      v(
        'sum(rate(http_server_requests_total{service="gate", http_response_status_code=~"5.."}[6h])) / sum(rate(http_server_requests_total{service="gate"}[6h]))',
      ),
    ).toBeLessThan(0.001)
    expect(
      v(
        'histogram_quantile(0.99, sum by (le) (rate(http_server_request_duration_seconds_bucket{service="gate"}[1h])))',
      ),
    ).toBeLessThan(0.5)
    // Traces through every service; the call path is the documented one.
    const t = tracesInWindow(sim, 6 * H - 60_000, 6 * H).find((x) => x.rootService === 'gate')
    expect(t?.spans.map((s) => s.service)).toEqual([
      'gate',
      'ravenpost-api',
      'ledger',
      'postgres',
      'queue',
    ])
    // kubectl agrees, and the context is prod.
    const sh = createShell(sim)
    expect(sh.run('kubectl config current-context').stdout).toBe('prod')
    expect(
      sh
        .run('kubectl get pods -n ravenpost --no-headers')
        .stdout.split('\n')
        .every((l) => /\s1\/1\s+Running\s+0\s/.test(l)),
    ).toBe(true)
    expect(sh.run('argocd app list').stdout).toMatch(
      /argocd\/ravenpost\s+\S+\s+ravenpost\s+default\s+Synced\s+Healthy/,
    )
  })
})
