import type { Span, Trace } from '@/sim/telemetry/traces'

/** A large made-up trace (tests and the kitchen sink): `n` spans, four children each, some failing. */
export function sampleTrace(n = 200): Trace {
  const services = ['api', 'ledger', 'postgres', 'queue']
  const spans: Span[] = Array.from({ length: n }, (_, i) => ({
    traceId: 'a'.repeat(32),
    spanId: `s${String(i).padStart(15, '0')}`,
    ...(i > 0 ? { parentSpanId: `s${String(Math.floor((i - 1) / 4)).padStart(15, '0')}` } : {}),
    name: i === 0 ? 'GET /messages' : `call ${String(i)}`,
    kind: 'SPAN_KIND_SERVER',
    start: i * 5,
    end: i === 0 ? 2000 : i * 5 + 40,
    service: i === 0 ? 'gate' : (services[i % 4] ?? 'api'),
    namespace: 'ravenpost',
    pod: `${i === 0 ? 'gate' : (services[i % 4] ?? 'api')}-1`,
    attributes: { 'http.route': '/messages' },
    status:
      i > 0 && i % 37 === 0
        ? { code: 'STATUS_CODE_ERROR', message: 'timeout' }
        : { code: 'STATUS_CODE_UNSET' },
    events: [],
  }))
  return {
    traceId: 'a'.repeat(32),
    rootService: 'gate',
    start: 0,
    durationMs: 2000,
    error: true,
    spans,
  }
}
