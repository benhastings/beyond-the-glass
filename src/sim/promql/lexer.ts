/** PromQL tokens (E8-03). */
export type TokenType = 'number' | 'duration' | 'string' | 'ident' | 'op' | 'punct' | 'eof'

export interface Token {
  type: TokenType
  text: string
  /** Character offset in the query. */
  pos: number
  /** For numbers and durations: the value (durations in ms). */
  value?: number
}

export class PromqlError extends Error {
  readonly pos: number | undefined
  constructor(message: string, pos?: number) {
    super(message)
    this.pos = pos
  }
}

const UNITS: Record<string, number> = {
  ms: 1,
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  w: 604_800_000,
  y: 31_536_000_000,
}

/** `5m`, `1h30m`, `500ms` in ms, or undefined. */
export function parsePromDuration(text: string): number | undefined {
  if (!/^(\d+(ms|s|m|h|d|w|y))+$/.test(text)) return undefined
  let ms = 0
  for (const [, n, u] of text.matchAll(/(\d+)(ms|s|m|h|d|w|y)/g))
    ms += Number(n) * (UNITS[u ?? ''] ?? 0)
  return ms
}

const OPS = ['==', '!=', '<=', '>=', '=~', '!~', '+', '-', '*', '/', '%', '^', '<', '>', '=', '@']
const PUNCT = '{}()[],:'

export function lex(q: string): Token[] {
  const out: Token[] = []
  let i = 0
  while (i < q.length) {
    const c = q.charAt(i)
    if (/\s/.test(c)) {
      i++
      continue
    }
    if (c === '#') {
      while (i < q.length && q.charAt(i) !== '\n') i++
      continue
    }
    const start = i
    if (c === '"' || c === "'" || c === '`') {
      i++
      let s = ''
      while (i < q.length && q.charAt(i) !== c) {
        if (q.charAt(i) === '\\' && c !== '`') {
          const n = q.charAt(i + 1)
          s += n === 'n' ? '\n' : n === 't' ? '\t' : n
          i += 2
        } else s += q.charAt(i++)
      }
      if (i >= q.length)
        throw new PromqlError(`unterminated string starting at position ${String(start)}`, start)
      i++
      out.push({ type: 'string', text: s, pos: start })
      continue
    }
    if (/[0-9.]/.test(c)) {
      const m = /^(\d+(?:ms|s|m|h|d|w|y))+|^(?:0x[0-9a-fA-F]+|\d*\.?\d+(?:[eE][+-]?\d+)?)/.exec(
        q.slice(i),
      )
      const text = m?.[0] ?? c
      i += text.length
      const d = parsePromDuration(text)
      if (d !== undefined) out.push({ type: 'duration', text, pos: start, value: d })
      else if (!Number.isNaN(Number(text)))
        out.push({ type: 'number', text, pos: start, value: Number(text) })
      else throw new PromqlError(`unexpected "${text}" at position ${String(start)}`, start)
      continue
    }
    if (/[a-zA-Z_:]/.test(c)) {
      const text = /^[a-zA-Z_:][a-zA-Z0-9_:]*/.exec(q.slice(i))?.[0] ?? c
      i += text.length
      const lower = text.toLowerCase()
      if (lower === 'inf' || lower === 'nan')
        out.push({ type: 'number', text, pos: start, value: lower === 'inf' ? Infinity : NaN })
      else out.push({ type: 'ident', text, pos: start })
      continue
    }
    const op = OPS.find((o) => q.startsWith(o, i))
    if (op) {
      i += op.length
      out.push({ type: 'op', text: op, pos: start })
      continue
    }
    if (PUNCT.includes(c)) {
      i++
      out.push({ type: 'punct', text: c, pos: start })
      continue
    }
    throw new PromqlError(`unexpected "${c}" at position ${String(start)}`, start)
  }
  out.push({ type: 'eof', text: '', pos: q.length })
  return out
}
