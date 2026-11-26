import type { Simulator } from '../core/simulator.ts'
import { tracesInWindow, type Span, type Trace } from '../telemetry/traces.ts'

/**
 * TraceQL, the subset this simulation supports (E8-05): spanset filters `{ … }` over intrinsics (`name`,
 * `status`, `duration`, `kind`), span attributes (`span.http.response.status_code`), resource attributes
 * (`resource.service.name`) and either (`.service.name`), with `= != > >= < <= =~ !~`, `&&`, `||` and
 * parentheses; and the descendant operator `{A} >> {B}`. Anything else is refused, quoting it.
 */
export class TraceqlError extends Error {}

type Value = string | number | boolean
type Cond =
  | { type: 'cmp'; field: string; op: string; value: Value }
  | { type: 'and'; a: Cond; b: Cond }
  | { type: 'or'; a: Cond; b: Cond }
  | { type: 'true' }
export type Query =
  { type: 'filter'; cond: Cond } | { type: 'descendant'; parent: Query; child: Query }

const STATUS = {
  error: 'STATUS_CODE_ERROR',
  ok: 'STATUS_CODE_OK',
  unset: 'STATUS_CODE_UNSET',
} as const
const KIND = {
  server: 'SPAN_KIND_SERVER',
  client: 'SPAN_KIND_CLIENT',
  consumer: 'SPAN_KIND_CONSUMER',
  producer: 'SPAN_KIND_PRODUCER',
  internal: 'SPAN_KIND_INTERNAL',
} as const
const UNSUPPORTED: [RegExp, string][] = [
  [
    /\|\s*(count|avg|min|max|sum|quantile_over_time|histogram_over_time|rate|by|select|coalesce)\s*\(/,
    'filters only, like { status = error }',
  ],
  [
    /\}\s*(>|<|~|!>>|!<<|<<|&>>|!~|&~)\s*\{/,
    'the descendant operator >>, like { resource.service.name = "api" } >> { status = error }',
  ],
  [/\}\s*(&&|\|\|)\s*\{/, 'one spanset with && inside it, like { a && b }'],
]

/** Tokens: braces, parens, operators, strings, durations, numbers, idents (dotted paths). */
function lex(
  q: string,
): { t: string; v?: Value; kind: 'op' | 'str' | 'num' | 'ident' | 'punct' }[] {
  const out: { t: string; v?: Value; kind: 'op' | 'str' | 'num' | 'ident' | 'punct' }[] = []
  let i = 0
  while (i < q.length) {
    const c = q.charAt(i)
    if (/\s/.test(c)) {
      i++
      continue
    }
    const two = q.slice(i, i + 2)
    if (['>>', '&&', '||', '!=', '>=', '<=', '=~', '!~'].includes(two)) {
      out.push({ t: two, kind: 'op' })
      i += 2
      continue
    }
    if ('=<>'.includes(c)) {
      out.push({ t: c, kind: 'op' })
      i++
      continue
    }
    if ('{}()'.includes(c)) {
      out.push({ t: c, kind: 'punct' })
      i++
      continue
    }
    if (c === '"') {
      let j = i + 1
      let s = ''
      while (j < q.length && q.charAt(j) !== '"') s += q.charAt(q.charAt(j) === '\\' ? ++j : j++)
      if (j >= q.length) throw new TraceqlError(`unterminated string at position ${String(i)}`)
      out.push({ t: s, v: s, kind: 'str' })
      i = j + 1
      continue
    }
    const num = /^-?\d+(\.\d+)?(ns|us|µs|ms|s|m|h)?/.exec(q.slice(i))
    if (num && /[\d-]/.test(c)) {
      const text = num[0]
      const unit = num[2]
      const factor = unit
        ? { ns: 1e-6, us: 1e-3, µs: 1e-3, ms: 1, s: 1000, m: 60_000, h: 3_600_000 }[unit]
        : undefined
      const n = Number(unit ? text.slice(0, -unit.length) : text)
      out.push({ t: text, v: factor === undefined ? n : n * factor, kind: 'num' })
      i += text.length
      continue
    }
    const id = /^\.?[a-zA-Z_][a-zA-Z0-9_.:-]*/.exec(q.slice(i))
    if (id) {
      out.push({ t: id[0], v: id[0], kind: 'ident' })
      i += id[0].length
      continue
    }
    throw new TraceqlError(`unexpected "${c}" at position ${String(i)}`)
  }
  return out
}

export function parseTraceql(query: string): Query {
  for (const [re, tryThis] of UNSUPPORTED) {
    const m = re.exec(query)
    if (m)
      throw new TraceqlError(`"${m[0].trim()}" isn't available in this simulation — try ${tryThis}`)
  }
  if (query.includes('|')) {
    const part = query.slice(query.indexOf('|')).trim().split(/\s/)[0] ?? '|'
    if (!part.startsWith('||'))
      throw new TraceqlError(
        `"${query.slice(query.indexOf('|')).trim()}" isn't available in this simulation — try filters only, like { status = error }`,
      )
  }
  const tokens = lex(query)
  let i = 0
  const peek = () => tokens[i]
  const next = () => tokens[i++]
  const expect = (t: string) => {
    const x = next()
    if (x?.t !== t)
      throw new TraceqlError(
        x ? `unexpected "${x.t}": expected "${t}"` : `the query ends too soon: expected "${t}"`,
      )
  }
  const cond = (): Cond => {
    let left = term()
    for (let op = peek(); op?.kind === 'op' && (op.t === '&&' || op.t === '||'); op = peek()) {
      next()
      const right = term()
      left = op.t === '&&' ? { type: 'and', a: left, b: right } : { type: 'or', a: left, b: right }
    }
    return left
  }
  const term = (): Cond => {
    const t = peek()
    if (t?.t === '(') {
      next()
      const c = cond()
      expect(')')
      return c
    }
    const f = next()
    if (!f || f.kind !== 'ident')
      throw new TraceqlError(
        f
          ? `unexpected "${f.t}": expected a field like status or span.http.route`
          : 'the query ends too soon: expected a field',
      )
    const op = next()
    if (!op || op.kind !== 'op' || ['&&', '||', '>>'].includes(op.t))
      throw new TraceqlError(
        op
          ? `unexpected "${op.t}" after ${f.t}: expected = != > >= < <= =~ or !~`
          : `the query ends too soon after ${f.t}`,
      )
    const v = next()
    if (!v || v.kind === 'punct' || v.kind === 'op')
      throw new TraceqlError(
        v
          ? `unexpected "${v.t}": expected a value`
          : `the query ends too soon: expected a value for ${f.t}`,
      )
    let value: Value = v.v ?? v.t
    if (v.kind === 'ident') {
      if (v.t === 'true' || v.t === 'false') value = v.t === 'true'
      else if (f.t === 'status' && v.t in STATUS) value = STATUS[v.t as keyof typeof STATUS]
      else if (f.t === 'kind' && v.t in KIND) value = KIND[v.t as keyof typeof KIND]
      else throw new TraceqlError(`"${v.t}" isn't a value here: quote strings, like "${v.t}"`)
    }
    if ((op.t === '=~' || op.t === '!~') && typeof value !== 'string')
      throw new TraceqlError(`${op.t} needs a quoted regular expression`)
    return { type: 'cmp', field: f.t, op: op.t, value }
  }
  const spanset = (): Query => {
    expect('{')
    if (peek()?.t === '}') {
      next()
      return { type: 'filter', cond: { type: 'true' } }
    }
    const c = cond()
    expect('}')
    return { type: 'filter', cond: c }
  }
  let q = spanset()
  while (peek()?.t === '>>') {
    next()
    q = { type: 'descendant', parent: q, child: spanset() }
  }
  if (i < tokens.length) throw new TraceqlError(`unexpected "${tokens[i]?.t ?? ''}" at the end`)
  return q
}

/** A field's value on a span, or undefined. */
function field(s: Span, name: string): Value | undefined {
  switch (name) {
    case 'name':
      return s.name
    case 'status':
      return s.status.code
    case 'statusMessage':
      return s.status.message
    case 'duration':
      return s.end - s.start
    case 'kind':
      return s.kind
  }
  const resource: Record<string, string> = {
    'service.name': s.service,
    'k8s.namespace.name': s.namespace,
    ...(s.pod ? { 'k8s.pod.name': s.pod } : {}),
  }
  if (name.startsWith('resource.')) return resource[name.slice('resource.'.length)]
  if (name.startsWith('span.')) return s.attributes[name.slice('span.'.length)]
  if (name.startsWith('.')) return s.attributes[name.slice(1)] ?? resource[name.slice(1)]
  throw new TraceqlError(
    `"${name}" isn't a field here: try name, status, duration, kind, span.<attribute>, resource.<attribute> or .<attribute>`,
  )
}

function test(c: Cond, s: Span): boolean {
  if (c.type === 'true') return true
  if (c.type === 'and' || c.type === 'or')
    return c.type === 'and' ? test(c.a, s) && test(c.b, s) : test(c.a, s) || test(c.b, s)
  const v = field(s, c.field)
  if (v === undefined) return c.op === '!='
  switch (c.op) {
    case '=':
      return v === c.value
    case '!=':
      return v !== c.value
    case '=~':
      return new RegExp(`^(?:${String(c.value)})$`).test(String(v))
    case '!~':
      return !new RegExp(`^(?:${String(c.value)})$`).test(String(v))
    default: {
      if (typeof v !== 'number' || typeof c.value !== 'number') return false
      return c.op === '>'
        ? v > c.value
        : c.op === '>='
          ? v >= c.value
          : c.op === '<'
            ? v < c.value
            : v <= c.value
    }
  }
}

/** The spans of `t` that `q` selects (empty: the trace doesn't match). */
export function matchSpans(q: Query, t: Trace): Span[] {
  if (q.type === 'filter') return t.spans.filter((s) => test(q.cond, s))
  const parents = new Set(matchSpans(q.parent, t).map((s) => s.spanId))
  const byId = new Map(t.spans.map((s) => [s.spanId, s]))
  return matchSpans(q.child, t).filter((s) => {
    for (
      let p = s.parentSpanId ? byId.get(s.parentSpanId) : undefined;
      p;
      p = p.parentSpanId ? byId.get(p.parentSpanId) : undefined
    )
      if (parents.has(p.spanId)) return true
    return false
  })
}

export interface TraceMatch {
  trace: Trace
  spans: Span[]
}

/** Traces in [start, end] that match, newest first, with the spans that matched. */
export function searchTraces(
  sim: Simulator,
  query: string,
  start: number,
  end: number,
  limit = 50,
): TraceMatch[] {
  const q = parseTraceql(query)
  return tracesInWindow(sim, start, end)
    .map((trace) => ({ trace, spans: matchSpans(q, trace) }))
    .filter((m) => m.spans.length > 0)
    .reverse()
    .slice(0, limit)
}

/** The search form's fields as TraceQL. */
export function formQuery(f: {
  service?: string
  name?: string
  status?: 'error' | 'ok' | 'unset' | ''
  minMs?: number
  maxMs?: number
}): string {
  const parts = [
    f.service ? `resource.service.name = "${f.service}"` : '',
    f.name ? `name = "${f.name}"` : '',
    f.status ? `status = ${f.status}` : '',
    f.minMs !== undefined ? `duration >= ${String(f.minMs)}ms` : '',
    f.maxMs !== undefined ? `duration <= ${String(f.maxMs)}ms` : '',
  ].filter(Boolean)
  return `{ ${parts.join(' && ')} }`.replace('{  }', '{ }')
}
