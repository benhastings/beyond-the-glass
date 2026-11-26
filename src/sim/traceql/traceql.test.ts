import { describe, expect, it } from 'vitest'
import { acTest } from '@/test/ac'
import { telemetryScenario } from '../telemetry/testing'
import type { Span, Trace } from '../telemetry/traces'
import { formQuery, matchSpans, parseTraceql, searchTraces, TraceqlError } from './traceql'

const attrs = (code: number | undefined): Record<string, string | number> =>
  code === undefined
    ? { 'db.system': 'postgresql' }
    : { 'http.response.status_code': code, 'http.route': '/messages' }

/** A hand-made trace: [service, name, parent index, start, end, http status or undefined, error?]. */
function trace(
  id: string,
  spans: [string, string, number | undefined, number, number, number | undefined, boolean?][],
): Trace {
  const ss: Span[] = spans.map(([service, name, parent, start, end, code, err], i) => ({
    traceId: id,
    spanId: `${id}-${String(i)}`,
    ...(parent !== undefined ? { parentSpanId: `${id}-${String(parent)}` } : {}),
    name,
    kind: service === 'scribe' ? 'SPAN_KIND_CONSUMER' : 'SPAN_KIND_SERVER',
    start,
    end,
    service,
    namespace: 'ravenpost',
    pod: `${service}-1`,
    attributes: attrs(code),
    status: err ? { code: 'STATUS_CODE_ERROR', message: 'boom' } : { code: 'STATUS_CODE_UNSET' },
    events: [],
  }))
  return {
    traceId: id,
    rootService: spans[0]?.[0] ?? '',
    start: 0,
    durationMs: 0,
    error: ss.some((s) => s.status.code === 'STATUS_CODE_ERROR'),
    spans: ss,
  }
}

const FIXTURES = [
  // A ledger outage: api fails because ledger has no endpoints.
  trace('t1', [
    ['gate', 'GET /messages', undefined, 0, 40, 500, true],
    ['api', 'GET /messages', 0, 2, 38, 500, true],
    ['ledger', 'GET /ledger', 1, 5, 6, 503, true],
  ]),
  // A slow ledger.
  trace('t2', [
    ['gate', 'GET /messages', undefined, 0, 900, 200],
    ['api', 'GET /messages', 0, 5, 890, 200],
    ['ledger', 'GET /ledger', 1, 10, 860, 200],
    ['postgres', 'SELECT messages', 2, 20, 40, undefined],
  ]),
  // The worker, healthy.
  trace('t3', [
    ['scribe', 'process message', undefined, 0, 60, undefined],
    ['postgres', 'SELECT messages', 0, 10, 30, undefined],
  ]),
]

const TABLE: [string, string[]][] = [
  ['{ resource.service.name = "ledger" && duration > 500ms }', ['t2']],
  ['{ status = error }', ['t1']],
  ['{ span.http.response.status_code >= 500 }', ['t1']],
  ['{ resource.service.name = "api" } >> { status = error }', ['t1']],
  ['{ resource.service.name = "gate" } >> { name = "SELECT messages" }', ['t2']],
  ['{ .service.name = "scribe" || name = "SELECT messages" }', ['t2', 't3']],
  ['{ name =~ "GET .*" && duration < 50ms }', ['t1']],
  ['{ kind = consumer }', ['t3']],
  ['{ span.http.route != "/messages" }', ['t2', 't3']],
  [
    '{ (status = error || duration >= 0.85s) && resource.service.name !~ "gate|api" }',
    ['t1', 't2'],
  ],
  ['{ }', ['t1', 't2', 't3']],
  ['{ resource.k8s.pod.name = "postgres-1" && span.db.system = "postgresql" }', ['t2', 't3']],
]

describe('E8-05 TraceQL', () => {
  acTest(
    'E8-05.AC4',
    'the TraceQL subset finds the expected traces; unsupported TraceQL quotes what isn’t available',
    () => {
      for (const [q, ids] of TABLE)
        expect(
          FIXTURES.filter((t) => matchSpans(parseTraceql(q), t).length > 0).map((t) => t.traceId),
          q,
        ).toEqual(ids)
      // `>>` returns the descendant spans, not their ancestors.
      expect(
        matchSpans(
          parseTraceql('{ resource.service.name = "api" } >> { status = error }'),
          FIXTURES[0] as Trace,
        ).map((s) => s.service),
      ).toEqual(['ledger'])
      const msg = (q: string) => {
        try {
          parseTraceql(q)
        } catch (e) {
          return (e as Error).message
        }
        return ''
      }
      expect(msg('{ status = error } | count() > 2')).toBe(
        '"| count(" isn\'t available in this simulation — try filters only, like { status = error }',
      )
      expect(msg('{ name = "a" } > { name = "b" }')).toMatch(
        /^"\} > \{" isn't available in this simulation — try the descendant operator >>/,
      )
      expect(msg('{ name = "a" } && { name = "b" }')).toMatch(
        /^"\} && \{" isn't available in this simulation — try one spanset/,
      )
      expect(msg('{ status = error } | select(span.http.route)')).toMatch(
        /^"\| select\(" isn't available/,
      )
      expect(msg('{ status = broken }')).toBe(
        '"broken" isn\'t a value here: quote strings, like "broken"',
      )
      expect(msg('{ name = }')).toBe('unexpected "}": expected a value')
      expect(msg('{ name = "x"')).toBe('the query ends too soon: expected "}"')
      expect(msg('{ name ~ "x" }')).toMatch(/^unexpected "~" at position/)
      expect(msg('{ duration =~ 5ms }')).toBe('=~ needs a quoted regular expression')
      expect(() => matchSpans(parseTraceql('{ foo = 1 }'), FIXTURES[0] as Trace)).toThrow(
        TraceqlError,
      )
    },
  )

  it('searches the simulation’s traces; the search form writes TraceQL', () => {
    const { sim } = telemetryScenario([
      { at: '+10m', type: 'injectLatency', namespace: 'ravenpost', service: 'ledger', ms: 600 },
    ])
    sim.advance(20 * 60_000)
    const slow = searchTraces(sim, formQuery({ service: 'ledger', minMs: 500 }), 0, 20 * 60_000)
    expect(slow.length).toBeGreaterThan(10)
    expect(slow.every((m) => m.trace.start >= 9 * 60_000)).toBe(true)
    expect(
      slow.every((m) => m.spans.every((s) => s.service === 'ledger' && s.end - s.start >= 500)),
    ).toBe(true)
    expect(searchTraces(sim, '{ }', 0, 20 * 60_000, 5)).toHaveLength(5)
    expect(formQuery({})).toBe('{ }')
    expect(formQuery({ status: 'error', name: 'GET /x', maxMs: 9 })).toBe(
      '{ name = "GET /x" && status = error && duration <= 9ms }',
    )
  })
})
