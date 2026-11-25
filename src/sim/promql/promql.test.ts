import { describe, expect, it } from 'vitest'
import { acTest } from '@/test/ac'
import { telemetryScenario } from '../telemetry/testing'
import {
  bucketQuantile,
  extrapolatedRate,
  instantQuery,
  rangeQuery,
  type RawSeries,
  type SeriesSource,
} from './evaluate'
import { STARTER_QUERIES } from './library'
import { lex, parsePromDuration, PromqlError } from './lexer'
import { parse } from './parser'
import { telemetrySource } from './source'

const T = 3600_000
const MI = 1024 ** 2
const base = { cluster: 'prod', namespace: 'ravenpost' }
/** A series sampled every 15 s from 0 to 1 h. */
const series = (labels: Record<string, string>, f: (s: number) => number): RawSeries => {
  const points: [number, number][] = []
  for (let t = 0; t <= T; t += 15_000) points.push([t, f(t / 1000)])
  return { labels: { ...base, ...labels }, points }
}
const req = (service: string, code: string, perSecond: number) =>
  series(
    { __name__: 'http_server_requests_total', service, http_response_status_code: code },
    (s) => perSecond * s,
  )
const pod = (name: string, labels: Record<string, string>, v: number | ((s: number) => number)) =>
  series({ __name__: name, ...labels }, typeof v === 'number' ? () => v : v)
const p = (podName: string, container: string) => ({ pod: podName, container })

/** Hand-made series: every expected value below can be worked out on paper. */
const FIXTURE: RawSeries[] = [
  req('gate', '200', 10),
  req('gate', '500', 0.5),
  req('gate', '503', 0),
  req('api', '200', 8),
  req('api', '500', 0),
  ...(
    [
      ['0.05', 2],
      ['0.1', 6],
      ['0.25', 9],
      ['0.5', 10],
      ['+Inf', 10.5],
    ] as const
  ).map(([le, n]) =>
    series(
      { __name__: 'http_server_request_duration_seconds_bucket', service: 'gate', le },
      (s) => n * s,
    ),
  ),
  series(
    { __name__: 'http_server_request_duration_seconds_sum', service: 'gate' },
    (s) => 1.05 * s,
  ),
  series(
    { __name__: 'http_server_request_duration_seconds_count', service: 'gate' },
    (s) => 10.5 * s,
  ),
  pod('kube_pod_container_status_restarts_total', p('ledger-1', 'ledger'), (s) =>
    s >= 3000 ? 2 : 0,
  ),
  pod('kube_pod_container_status_restarts_total', p('api-1', 'api'), 0),
  ...(
    [
      ['gate-1', 'gate', 100, 128],
      ['api-1', 'api', 300, 512],
      ['ledger-1', 'ledger', 200, 256],
      ['postgres-1', 'postgres', 400, 1024],
    ] as const
  ).flatMap(([pd, c, used, limit]) => [
    pod('container_memory_working_set_bytes', p(pd, c), used * MI),
    pod(
      'kube_pod_container_resource_limits',
      { ...p(pd, c), resource: 'memory', unit: 'byte' },
      limit * MI,
    ),
  ]),
  ...(
    [
      ['gate', 2],
      ['api', 2],
      ['ledger', 0],
      ['postgres', 1],
    ] as const
  ).map(([d, n]) => pod('kube_deployment_status_replicas_available', { deployment: d }, n)),
]
const FIXTURES: SeriesSource = {
  series: (names, start, end) =>
    FIXTURE.filter((s) => names.length === 0 || names.includes(s.labels.__name__ ?? '')).map(
      (s) => ({
        labels: s.labels,
        points: s.points.filter(([t]) => t >= start && t <= end),
      }),
    ),
}

/** Each starter query's expected result at 1 h: `label=value,…` → value. */
const EXPECTED: Record<string, Record<string, number>> = {
  'request-rate': { 'service=gate': 10.5, 'service=api': 8 },
  'error-ratio': { 'service=gate': 0.5 / 10.5, 'service=api': 0 },
  'gate-errors': { '': 0.5 },
  'p99-latency': { 'service=gate': 0.5 },
  'p50-latency': { 'service=gate': 0.05 + (0.05 * 3.25) / 4 },
  'p90-latency': { 'service=gate': 0.25 + 0.25 * 0.45 },
  'mean-latency': { 'service=gate': 0.1 },
  restarts: { 'container=ledger,pod=ledger-1': 2 },
  'restarts-earlier': { 'container=ledger,pod=ledger-1': 2, 'container=api,pod=api-1': 0 },
  'top-memory': {
    'container=postgres,pod=postgres-1': 400 * MI,
    'container=api,pod=api-1': 300 * MI,
    'container=ledger,pod=ledger-1': 200 * MI,
  },
  'memory-vs-limit': {
    'container=gate,pod=gate-1': 100 / 128,
    'container=api,pod=api-1': 300 / 512,
    'container=ledger,pod=ledger-1': 200 / 256,
    'container=postgres,pod=postgres-1': 400 / 1024,
  },
  'memory-near-limit': {
    'container=gate,pod=gate-1': 100 / 128,
    'container=ledger,pod=ledger-1': 200 / 256,
  },
  'nothing-available': { 'deployment=ledger': 0 },
  'replicas-by-namespace': { 'namespace=ravenpost': 5 },
  'instant-rate': { 'container=,pod=,service=api': 8 },
  'containers-per-namespace': { 'namespace=ravenpost': 4 },
  'max-memory': { 'namespace=ravenpost': 400 * MI },
  'fewest-available': { '': 0 },
}
/** The labels that tell a result apart (cluster and namespace are the same everywhere, unless grouped by). */
const key = (l: Record<string, string>, id: string) => {
  const wanted = Object.keys(EXPECTED[id] ?? {})[0] ?? ''
  const names = wanted ? wanted.split(',').map((x) => x.split('=')[0] ?? '') : []
  return names.map((n) => `${n}=${l[n] ?? ''}`).join(',')
}

describe('E8-03 PromQL', () => {
  acTest(
    'E8-03.AC1',
    'every starter query gives the hand-computed values on the fixture series',
    () => {
      expect(STARTER_QUERIES.length).toBeGreaterThanOrEqual(15)
      expect(STARTER_QUERIES.length).toBeLessThanOrEqual(20)
      for (const q of STARTER_QUERIES) {
        const v = instantQuery(FIXTURES, q.query, T)
        expect(v.kind, q.id).toBe('vector')
        const got =
          v.kind === 'vector'
            ? Object.fromEntries(v.samples.map((s) => [key(s.labels, q.id), s.value]))
            : {}
        const want = EXPECTED[q.id] ?? {}
        expect(Object.keys(got).sort(), q.id).toEqual(Object.keys(want).sort())
        for (const [k, value] of Object.entries(want))
          expect(got[k], `${q.id} ${k}`).toBeCloseTo(value, 9)
        expect(q.explanation).not.toMatch(/\b(simply|just|obviously|easy|trivial)\b/i)
      }
    },
  )

  acTest(
    'E8-03.AC2',
    'unsupported functions and syntax say what isn’t available and what to try',
    () => {
      const msg = (q: string) => {
        try {
          parse(q)
        } catch (e) {
          return (e as Error).message
        }
        return ''
      }
      expect(msg('avg_over_time(container_memory_working_set_bytes[5m])')).toBe(
        '"avg_over_time" isn\'t available in this simulation — try rate() or increase() over a range, or avg by (…) across series',
      )
      expect(msg('absent(up)')).toBe(
        '"absent" isn\'t available in this simulation — try count(…) == 0',
      )
      expect(msg('stddev(container_memory_working_set_bytes)')).toMatch(
        /^"stddev" isn't available in this simulation — try /,
      )
      expect(msg('a / on(pod) group_left b')).toMatch(
        /^"group_left" isn't available in this simulation — try one-to-one matching/,
      )
      expect(msg('rate(x[5m:1m])')).toMatch(/subqueries like "\[5m:…\]" aren't available/)
      expect(msg('x @ 100')).toMatch(/the "@" modifier isn't available/)
      expect(msg('frobnicate(x)')).toBe(
        '"frobnicate" isn\'t a function: try rate, irate, increase, histogram_quantile',
      )
      expect(msg('sum(rate(x[5m])')).toBe('the query ends too soon: expected ")"')
      expect(msg('x{a=b}')).toMatch(/unexpected "b" at position 4: expected a quoted label value/)
      expect(msg('{a!=""}')).toMatch(/needs at least one matcher/)
      expect(msg('x{a=~"("}')).toMatch(/isn't a valid regular expression/)
      expect(msg('rate(x)')).toBe('')
      expect(() => instantQuery(FIXTURES, 'rate(http_server_requests_total)', T)).toThrow(
        /needs a range vector/,
      )
      expect(() => instantQuery(FIXTURES, 'sum(http_server_requests_total[5m])', T)).toThrow(
        /needs an instant vector/,
      )
      expect(() => instantQuery(FIXTURES, '1 > 0', T)).toThrow(/needs "bool"/)
      expect(() => rangeQuery(FIXTURES, 'http_server_requests_total[5m]', 0, T, 60_000)).toThrow(
        /can’t be graphed/,
      )
      expect(() => lex('x ¬ y')).toThrow(PromqlError)
    },
  )

  it('Prometheus semantics: lookback, extrapolation, counter resets, quantiles, matching, set operators', () => {
    // A counter that resets: 10, 20, 5, 15 over 45 s in a 60 s window.
    const pts: [number, number][] = [
      [15_000, 10],
      [30_000, 20],
      [45_000, 5],
      [60_000, 15],
    ]
    expect(extrapolatedRate(pts, 0, 60_000, false)).toBeCloseTo((15 - 10 + 20) * (60 / 45), 9)
    expect(extrapolatedRate(pts.slice(0, 1), 0, 60_000, true)).toBeUndefined()
    expect(bucketQuantile(0.5, [{ le: 1, count: 1 }])).toBeNaN()
    expect(bucketQuantile(-1, [])).toBe(-Infinity)
    expect(bucketQuantile(2, [])).toBe(Infinity)
    const v = (q: string, t = T) => instantQuery(FIXTURES, q, t)
    // A sample older than the 5-minute lookback isn't seen.
    expect(v('container_memory_working_set_bytes{pod="gate-1"} offset 2h')).toEqual({
      kind: 'vector',
      samples: [],
    })
    expect(v('2 * 3 + 1')).toEqual({ kind: 'scalar', value: 7 })
    expect(v('2 ^ 3 ^ 2')).toEqual({ kind: 'scalar', value: 512 })
    expect(v('-kube_deployment_status_replicas_available{deployment="gate"}')).toMatchObject({
      samples: [{ value: -2 }],
    })
    expect(v('kube_deployment_status_replicas_available > bool 1')).toMatchObject({
      kind: 'vector',
    })
    expect(v('sum(kube_deployment_status_replicas_available > bool 1)')).toMatchObject({
      samples: [{ value: 2 }],
    })
    expect(v('1 + kube_deployment_status_replicas_available{deployment="api"}')).toMatchObject({
      samples: [{ value: 3 }],
    })
    expect(
      v(
        'kube_deployment_status_replicas_available and kube_deployment_status_replicas_available > 1',
      ),
    ).toMatchObject({ samples: [{}, {}] })
    expect(
      v(
        'kube_deployment_status_replicas_available unless kube_deployment_status_replicas_available > 0',
      ),
    ).toMatchObject({ samples: [{ value: 0 }] })
    const or = v(
      'kube_deployment_status_replicas_available{deployment="ledger"} or kube_deployment_status_replicas_available{deployment="gate"}',
    )
    expect(or.kind === 'vector' && or.samples.length).toBe(2)
    expect(v('topk(1, container_memory_working_set_bytes) by (namespace)')).toMatchObject({
      samples: [{ value: 400 * MI }],
    })
    expect(v('avg by (namespace) (container_memory_working_set_bytes)')).toMatchObject({
      samples: [{ value: 250 * MI }],
    })
    expect(v('min by (namespace) (container_memory_working_set_bytes)')).toMatchObject({
      samples: [{ value: 100 * MI }],
    })
    expect(
      v('{__name__="kube_deployment_status_replicas_available", deployment="api"}'),
    ).toMatchObject({ samples: [{ value: 2 }] })
    expect(
      v(
        'container_memory_working_set_bytes{pod!~"(gate|api)-1"} / on(pod, container) kube_pod_container_resource_limits',
      ),
    ).toMatchObject({ kind: 'vector' })
    expect(() =>
      v('container_memory_working_set_bytes / on(namespace) kube_pod_container_resource_limits'),
    ).toThrow(/many-to-one matching/)
    const r = rangeQuery(
      FIXTURES,
      'sum by (service) (rate(http_server_requests_total[5m]))',
      T - 600_000,
      T,
      60_000,
    )
    expect(r.series.map((s) => s.points.length)).toEqual([11, 11])
    expect(rangeQuery(FIXTURES, '1 + 1', 0, 60_000, 30_000)).toMatchObject({
      resultType: 'scalar',
      series: [
        {
          points: [
            [0, 2],
            [30_000, 2],
            [60_000, 2],
          ],
        },
      ],
    })
    expect(parsePromDuration('1h30m')).toBe(5_400_000)
    expect(lex('0x1F "a\\nb" # comment').map((t) => t.value ?? t.text)).toEqual([31, 'a\nb', ''])
  })

  it('reads the simulation’s telemetry', () => {
    const { sim } = telemetryScenario()
    sim.advance(T)
    const v = instantQuery(telemetrySource(sim), STARTER_QUERIES[0]?.query ?? '', T)
    const byService: Record<string, number> =
      v.kind === 'vector'
        ? Object.fromEntries(
            v.samples.map((s): [string, number] => [s.labels.service ?? '', s.value]),
          )
        : {}
    expect(Object.keys(byService).sort()).toEqual([
      'api',
      'gate',
      'ledger',
      'postgres',
      'queue',
      'scribe',
    ])
    expect(byService.gate).toBeGreaterThan(20)
    expect(byService.api).toBeCloseTo(byService.gate ?? 0, 6)
    expect(instantQuery(telemetrySource(sim), 'no_such_metric', T)).toEqual({
      kind: 'vector',
      samples: [],
    })
    const p99 = instantQuery(
      telemetrySource(sim),
      STARTER_QUERIES.find((q) => q.id === 'p99-latency')?.query ?? '',
      T,
    )
    expect(p99.kind === 'vector' && p99.samples.every((s) => s.value > 0 && s.value < 1)).toBe(true)
  })
})
