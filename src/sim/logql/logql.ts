import type { Simulator } from '../core/simulator.ts'
import { logsInWindow } from '../telemetry/logs.ts'

/**
 * LogQL, the subset this simulation supports (E8-04): a stream selector (`{namespace="ravenpost",
 * app="ledger"}` with `= != =~ !~` over `cluster`, `namespace`, `pod`, `container` and `app`), line
 * filters (`|= != |~ !~`), and `| json` followed by field filters (`| level="error"`,
 * `| duration_ms > 500`). The lines come from the same place `kubectl logs` reads (E6-06).
 */
export class LogqlError extends Error {}

export interface Matcher {
  label: string
  op: '=' | '!=' | '=~' | '!~'
  value: string
}
export type Stage =
  | { type: 'line'; op: '|=' | '!=' | '|~' | '!~'; value: string }
  | { type: 'json' }
  | {
      type: 'field'
      field: string
      op: '=' | '!=' | '=~' | '!~' | '>' | '>=' | '<' | '<='
      value: string | number
    }

export interface LogQuery {
  matchers: Matcher[]
  stages: Stage[]
}

export interface LogEntry {
  t: number
  labels: { cluster: string; namespace: string; pod: string; container: string; app: string }
  line: string
  /** Parsed by `| json` (or for display): the line's JSON fields. */
  fields?: Record<string, string>
}

const LABELS = ['cluster', 'namespace', 'pod', 'container', 'app'] as const
const NOT_HERE: [RegExp, string][] = [
  [
    /^\s*(rate|count_over_time|bytes_over_time|bytes_rate|sum|avg|max|min|topk|absent_over_time)\s*\(/,
    'the logs themselves, like {namespace="ravenpost"} |= "error"; for rates, use PromQL',
  ],
  [/\|\s*(logfmt|pattern|regexp|unpack)\b/, '| json (the lines here are JSON)'],
  [
    /\|\s*(line_format|label_format|unwrap|keep|drop|decolorize)\b/,
    'line filters and | json field filters',
  ],
]

function lexString(q: string, i: number): [string, number] {
  const quote = q.charAt(i)
  let j = i + 1
  let s = ''
  while (j < q.length && q.charAt(j) !== quote) {
    if (q.charAt(j) === '\\' && quote !== '`') {
      j++
      const c = q.charAt(j)
      s += c === 'n' ? '\n' : c === 't' ? '\t' : c
    } else s += q.charAt(j)
    j++
  }
  if (j >= q.length) throw new LogqlError(`unterminated string at position ${String(i)}`)
  return [s, j + 1]
}

export function parseLogql(query: string): LogQuery {
  for (const [re, tryThis] of NOT_HERE) {
    const m = re.exec(query)
    if (m)
      throw new LogqlError(`"${m[0].trim()}" isn't available in this simulation — try ${tryThis}`)
  }
  let i = 0
  const ws = () => {
    while (i < query.length && /\s/.test(query.charAt(i))) i++
  }
  const word = () => {
    const m = /^[a-zA-Z_][a-zA-Z0-9_.]*/.exec(query.slice(i))
    if (!m) return undefined
    i += m[0].length
    return m[0]
  }
  const str = (what: string) => {
    ws()
    const c = query.charAt(i)
    if (c !== '"' && c !== '`' && c !== "'")
      throw new LogqlError(`expected a quoted ${what} at position ${String(i)}`)
    const [s, j] = lexString(query, i)
    i = j
    return s
  }
  const op = (ops: string[]) => {
    ws()
    const o = ops.find((x) => query.startsWith(x, i))
    if (o) i += o.length
    return o
  }
  ws()
  if (query.charAt(i) !== '{')
    throw new LogqlError(
      'a LogQL query starts with a stream selector, like {namespace="ravenpost"}',
    )
  i++
  const matchers: Matcher[] = []
  for (;;) {
    ws()
    if (query.charAt(i) === '}') {
      i++
      break
    }
    const label = word()
    if (!label) throw new LogqlError(`expected a label name at position ${String(i)}`)
    if (!(LABELS as readonly string[]).includes(label))
      throw new LogqlError(`"${label}" isn't a label here: try ${LABELS.join(', ')}`)
    const o = op(['=~', '!~', '!=', '='])
    if (!o) throw new LogqlError(`expected = != =~ or !~ after ${label}`)
    const value = str(`value for ${label}`)
    if (o === '=~' || o === '!~') check(value)
    matchers.push({ label, op: o as Matcher['op'], value })
    ws()
    if (query.charAt(i) === ',') i++
  }
  if (
    !matchers.some(
      (m) =>
        (m.op === '=' && m.value) || (m.op === '=~' && !new RegExp(`^(?:${m.value})$`).test('')),
    )
  )
    throw new LogqlError(
      'the selector needs a matcher that rules out the empty value, such as {namespace="ravenpost"}',
    )
  const stages: Stage[] = []
  let json = false
  for (;;) {
    ws()
    if (i >= query.length) break
    const lineOp = op(['|=', '!=', '|~', '!~'])
    if (lineOp) {
      const value = str('string')
      if (lineOp === '|~' || lineOp === '!~') check(value)
      stages.push({
        type: 'line',
        op: lineOp as Extract<Stage, { type: 'line' }>['op'],
        value,
      })
      continue
    }
    if (query.charAt(i) !== '|')
      throw new LogqlError(`unexpected "${query.slice(i, i + 12)}" at position ${String(i)}`)
    i++
    ws()
    const start = i
    const name = word()
    if (name === 'json') {
      json = true
      stages.push({ type: 'json' })
      continue
    }
    if (!name)
      throw new LogqlError(`expected json or a field filter after "|" at position ${String(start)}`)
    if (!json) throw new LogqlError(`"| ${name} …" filters on a parsed field: put | json before it`)
    const o = op(['=~', '!~', '!=', '>=', '<=', '==', '=', '>', '<'])
    if (!o) throw new LogqlError(`expected a comparison after ${name}`)
    ws()
    let value: string | number
    const num = /^-?\d+(\.\d+)?/.exec(query.slice(i))
    if (num && !'"`\''.includes(query.charAt(i))) {
      value = Number(num[0])
      i += num[0].length
    } else value = str(`value for ${name}`)
    if (['>', '>=', '<', '<='].includes(o) && typeof value !== 'number')
      throw new LogqlError(`${o} compares numbers: write ${name} ${o} 500`)
    if ((o === '=~' || o === '!~') && typeof value === 'string') check(value)
    stages.push({
      type: 'field',
      field: name,
      op: (o === '==' ? '=' : o) as Extract<Stage, { type: 'field' }>['op'],
      value,
    })
  }
  return { matchers, stages }
}

function check(re: string) {
  try {
    new RegExp(re)
  } catch {
    throw new LogqlError(`"${re}" isn't a valid regular expression`)
  }
}

const matchLabel = (m: Matcher, v: string) =>
  m.op === '='
    ? v === m.value
    : m.op === '!='
      ? v !== m.value
      : m.op === '=~'
        ? new RegExp(`^(?:${m.value})$`).test(v)
        : !new RegExp(`^(?:${m.value})$`).test(v)

export function parseJsonLine(line: string): Record<string, string> | undefined {
  try {
    const o = JSON.parse(line) as unknown
    if (typeof o !== 'object' || o === null || Array.isArray(o)) return undefined
    return Object.fromEntries(
      Object.entries(o).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)]),
    )
  } catch {
    return undefined
  }
}

function passes(stages: Stage[], e: LogEntry): boolean {
  for (const s of stages) {
    if (s.type === 'line') {
      const hit =
        s.op === '|=' || s.op === '!=' ? e.line.includes(s.value) : new RegExp(s.value).test(e.line)
      if ((s.op === '|=' || s.op === '|~') !== hit) return false
    } else if (s.type === 'json') {
      const f = parseJsonLine(e.line)
      // Lines that aren't JSON get Loki's __error__ label; this simulation drops them from field filters.
      e.fields = f ?? { __error__: 'JSONParserErr' }
    } else {
      const v = e.fields?.[s.field]
      if (v === undefined) return s.op === '!=' || s.op === '!~'
      if (typeof s.value === 'number') {
        const n = Number(v)
        if (Number.isNaN(n)) return false
        if (
          !(s.op === '>'
            ? n > s.value
            : s.op === '>='
              ? n >= s.value
              : s.op === '<'
                ? n < s.value
                : s.op === '<='
                  ? n <= s.value
                  : s.op === '='
                    ? n === s.value
                    : n !== s.value)
        )
          return false
      } else if (!matchLabel({ label: s.field, op: s.op as Matcher['op'], value: s.value }, v))
        return false
    }
  }
  return true
}

/** Every matching line in [start, end], oldest first (all of them: the volume histogram counts them). */
export function queryLogs(sim: Simulator, query: string, start: number, end: number): LogEntry[] {
  const q = parseLogql(query)
  const out: LogEntry[] = []
  for (const c of sim.scenario.clusters) {
    const cluster = sim.clusterByName(c.name)
    for (const pod of cluster?.list('Pod') ?? []) {
      const ns = pod.metadata.namespace ?? 'default'
      const app = pod.metadata.labels?.app ?? ''
      for (const ct of pod.spec.containers) {
        const labels = {
          cluster: c.name,
          namespace: ns,
          pod: pod.metadata.name,
          container: ct.name,
          app,
        }
        if (!q.matchers.every((m) => matchLabel(m, labels[m.label as keyof typeof labels])))
          continue
        for (const l of logsInWindow(sim, pod, ct.name, start, end)) {
          const e: LogEntry = { t: l.t, labels, line: l.text }
          if (passes(q.stages, e)) out.push(e)
        }
      }
    }
  }
  return out.sort((a, b) => a.t - b.t || (a.labels.pod < b.labels.pod ? -1 : 1))
}

/** Lines per bucket across [start, end]: Grafana's log volume. */
export function logVolume(
  entries: readonly LogEntry[],
  start: number,
  end: number,
  buckets = 60,
): { t: number; count: number }[] {
  const size = Math.max(1, (end - start) / buckets)
  const out = Array.from({ length: buckets }, (_, k) => ({ t: start + k * size, count: 0 }))
  for (const e of entries) {
    const k = Math.min(buckets - 1, Math.floor((e.t - start) / size))
    const b = out[k]
    if (b) b.count++
  }
  return out
}
