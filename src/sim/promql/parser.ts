import { lex, PromqlError, type Token } from './lexer.ts'

/** The PromQL syntax tree (E8-03). */
export interface Matcher {
  label: string
  op: '=' | '!=' | '=~' | '!~'
  value: string
}

export type Expr =
  | { type: 'number'; value: number }
  | { type: 'string'; value: string }
  | { type: 'selector'; name?: string; matchers: Matcher[]; range?: number; offset: number }
  | { type: 'call'; fn: string; args: Expr[] }
  | {
      type: 'agg'
      op: string
      param?: Expr
      expr: Expr
      grouping: { mode: 'by' | 'without'; labels: string[] } | undefined
    }
  | {
      type: 'binary'
      op: string
      lhs: Expr
      rhs: Expr
      bool: boolean
      matching?: { mode: 'on' | 'ignoring'; labels: string[] }
    }
  | { type: 'unary'; op: '-' | '+'; expr: Expr }

export const FUNCTIONS = ['rate', 'irate', 'increase', 'histogram_quantile'] as const
export const AGGREGATIONS = ['sum', 'avg', 'max', 'min', 'count', 'topk'] as const

/** Real PromQL that this simulation leaves out, with what to try instead. */
const NOT_HERE: Record<string, string> = {
  avg_over_time: 'rate() or increase() over a range, or avg by (…) across series',
  min_over_time: 'min by (…) across series',
  max_over_time: 'max by (…) across series, or topk()',
  sum_over_time: 'increase() on a counter',
  count_over_time: 'count by (…)',
  quantile_over_time: 'histogram_quantile() on a histogram',
  stddev_over_time: 'avg by (…)',
  last_over_time: 'the metric on its own (its latest value)',
  present_over_time: 'count by (…)',
  delta: 'increase() (counters) or a subtraction with offset (gauges)',
  idelta: 'irate()',
  deriv: 'rate()',
  predict_linear: 'rate() and some arithmetic',
  changes: 'increase() on a counter',
  resets: 'increase() on a restarts counter',
  absent: 'count(…) == 0',
  absent_over_time: 'count(…) == 0',
  label_replace: 'sum by (…) to regroup',
  label_join: 'sum by (…) to regroup',
  abs: 'arithmetic with + - * /',
  ceil: 'arithmetic with + - * /',
  floor: 'arithmetic with + - * /',
  round: 'arithmetic with + - * /',
  clamp: 'a comparison such as > 0',
  clamp_min: 'a comparison such as > 0',
  clamp_max: 'a comparison such as < 1',
  exp: 'arithmetic with + - * /',
  ln: 'arithmetic with + - * /',
  log2: 'arithmetic with + - * /',
  log10: 'arithmetic with + - * /',
  sqrt: 'arithmetic with ^ 0.5',
  sort: 'topk()',
  sort_desc: 'topk()',
  time: 'offset to compare with the past',
  timestamp: 'offset to compare with the past',
  vector: 'a number on its own',
  scalar: 'a number on its own',
  day_of_week: 'offset to compare with the past',
  hour: 'offset to compare with the past',
  holt_winters: 'rate()',
  quantile: 'histogram_quantile() or topk()',
  stddev: 'avg by (…)',
  stdvar: 'avg by (…)',
  bottomk: 'topk() with a negated expression: topk(3, -x)',
  count_values: 'count by (…)',
  group: 'count by (…)',
  limitk: 'topk()',
  group_left: 'one-to-one matching with on (…) or ignoring (…)',
  group_right: 'one-to-one matching with on (…) or ignoring (…)',
}

/** The message for real PromQL the simulation leaves out (AC2). */
export const notHere = (what: string, pos?: number) =>
  new PromqlError(
    `"${what}" isn't available in this simulation — try ${NOT_HERE[what] ?? 'one of: rate, irate, increase, sum, avg, max, min, count, topk, histogram_quantile'}`,
    pos,
  )

const PRECEDENCE: Record<string, number> = {
  or: 1,
  and: 2,
  unless: 2,
  '==': 3,
  '!=': 3,
  '<=': 3,
  '>=': 3,
  '<': 3,
  '>': 3,
  '+': 4,
  '-': 4,
  '*': 5,
  '/': 5,
  '%': 5,
  atan2: 5,
  '^': 6,
}
const COMPARISON = new Set(['==', '!=', '<=', '>=', '<', '>'])
export const isComparison = (op: string) => COMPARISON.has(op)

export function parse(query: string): Expr {
  const tokens = lex(query)
  let i = 0
  const peek = (o = 0): Token => tokens[Math.min(i + o, tokens.length - 1)] as Token
  const next = (): Token => tokens[Math.min(i++, tokens.length - 1)] as Token
  const fail = (t: Token, what?: string): never => {
    throw new PromqlError(
      t.type === 'eof'
        ? `the query ends too soon${what ? `: expected ${what}` : ''}`
        : `unexpected "${t.text}" at position ${String(t.pos)}${what ? `: expected ${what}` : ''}`,
      t.pos,
    )
  }
  const expect = (text: string): Token => {
    const t = next()
    if (t.text !== text || (t.type !== 'punct' && t.type !== 'op')) fail(t, `"${text}"`)
    return t
  }
  const labelList = (): string[] => {
    expect('(')
    const labels: string[] = []
    while (peek().text !== ')') {
      const t = next()
      if (t.type !== 'ident') fail(t, 'a label name')
      labels.push(t.text)
      if (peek().text === ',') next()
      else if (peek().text !== ')') fail(peek(), '"," or ")"')
    }
    expect(')')
    return labels
  }
  const binaryOp = (): string | undefined => {
    const t = peek()
    if (t.type === 'op' && t.text in PRECEDENCE) return t.text
    if (t.type === 'ident' && ['and', 'or', 'unless', 'atan2'].includes(t.text)) return t.text
    return undefined
  }

  const expr = (minPrec: number): Expr => {
    let lhs = unary()
    for (
      let op = binaryOp();
      op !== undefined && (PRECEDENCE[op] ?? 0) >= minPrec;
      op = binaryOp()
    ) {
      const t = next()
      if (op === 'atan2') throw notHere('atan2', t.pos)
      let bool = false
      if (peek().type === 'ident' && peek().text === 'bool') {
        if (!isComparison(op)) fail(peek(), 'bool only after a comparison')
        next()
        bool = true
      }
      let matching: { mode: 'on' | 'ignoring'; labels: string[] } | undefined
      if (peek().type === 'ident' && (peek().text === 'on' || peek().text === 'ignoring')) {
        const mode = next().text as 'on' | 'ignoring'
        matching = { mode, labels: labelList() }
      }
      if (
        peek().type === 'ident' &&
        (peek().text === 'group_left' || peek().text === 'group_right')
      )
        throw notHere(peek().text, peek().pos)
      const prec = PRECEDENCE[op] ?? 0
      // `^` is right-associative; the rest are left-associative.
      const rhs = expr(op === '^' ? prec : prec + 1)
      lhs = { type: 'binary', op, lhs, rhs, bool, ...(matching ? { matching } : {}) }
    }
    return lhs
  }

  const unary = (): Expr => {
    const t = peek()
    if (t.type === 'op' && (t.text === '-' || t.text === '+')) {
      next()
      return { type: 'unary', op: t.text, expr: unary() }
    }
    return postfix(primary())
  }

  const postfix = (e: Expr): Expr => {
    let out = e
    for (;;) {
      const t = peek()
      if (t.type === 'punct' && t.text === '[') {
        next()
        const d = next()
        if (d.type !== 'duration') fail(d, 'a duration like 5m')
        if (peek().text === ':' || (peek().type === 'ident' && peek().text.startsWith(':')))
          throw new PromqlError(
            `subqueries like "[${d.text}:…]" aren't available in this simulation — try rate() over a range`,
            peek().pos,
          )
        expect(']')
        if (out.type !== 'selector' || out.range !== undefined)
          throw new PromqlError(
            `a range like [${d.text}] goes right after a metric selector, at position ${String(t.pos)}`,
            t.pos,
          )
        out = { ...out, range: d.value ?? 0 }
        continue
      }
      if (t.type === 'ident' && t.text === 'offset') {
        next()
        const neg = peek().text === '-' ? (next(), -1) : 1
        const d = next()
        if (d.type !== 'duration') fail(d, 'a duration after offset')
        if (out.type !== 'selector')
          throw new PromqlError(
            `offset goes right after a metric selector, at position ${String(t.pos)}`,
            t.pos,
          )
        out = { ...out, offset: neg * (d.value ?? 0) }
        continue
      }
      if (t.type === 'op' && t.text === '@')
        throw new PromqlError(
          `the "@" modifier isn't available in this simulation — try offset`,
          t.pos,
        )
      return out
    }
  }

  const matchers = (): Matcher[] => {
    expect('{')
    const out: Matcher[] = []
    while (peek().text !== '}') {
      const l = next()
      if (l.type !== 'ident' && l.type !== 'string') fail(l, 'a label name')
      const op = next()
      if (op.type !== 'op' || !['=', '!=', '=~', '!~'].includes(op.text))
        fail(op, 'one of = != =~ !~')
      const v = next()
      if (v.type !== 'string') fail(v, 'a quoted label value')
      if (op.text === '=~' || op.text === '!~')
        try {
          new RegExp(`^(?:${v.text})$`)
        } catch {
          throw new PromqlError(`"${v.text}" isn't a valid regular expression`, v.pos)
        }
      out.push({ label: l.text, op: op.text as Matcher['op'], value: v.text })
      if (peek().text === ',') next()
      else if (peek().text !== '}') fail(peek(), '"," or "}"')
    }
    expect('}')
    return out
  }

  const primary = (): Expr => {
    const t = next()
    if (t.type === 'number') return { type: 'number', value: t.value ?? 0 }
    if (t.type === 'duration') fail(t, 'a number or a metric')
    if (t.type === 'string') return { type: 'string', value: t.text }
    if (t.type === 'punct' && t.text === '(') {
      const e = expr(0)
      expect(')')
      return e
    }
    if (t.type === 'punct' && t.text === '{') {
      i--
      const m = matchers()
      if (
        !m.some(
          (x) =>
            (x.op === '=' && x.value !== '') ||
            (x.op === '=~' && !new RegExp(`^(?:${x.value})$`).test('')),
        )
      )
        throw new PromqlError(
          'a selector needs at least one matcher that rules out the empty value, such as {service="gate"}',
          t.pos,
        )
      const name = m.find((x) => x.label === '__name__' && x.op === '=')?.value
      return {
        type: 'selector',
        ...(name ? { name } : {}),
        matchers: m.filter((x) => !(x.label === '__name__' && x.op === '=')),
        offset: 0,
      }
    }
    if (t.type !== 'ident') return fail(t, 'a metric, a number or a function')
    const name = t.text
    // Aggregations: sum by (x) (expr) or sum (expr) by (x).
    if (
      (AGGREGATIONS as readonly string[]).includes(name) ||
      ['stddev', 'stdvar', 'bottomk', 'quantile', 'count_values', 'group', 'limitk'].includes(name)
    ) {
      if (!(AGGREGATIONS as readonly string[]).includes(name)) throw notHere(name, t.pos)
      let grouping: { mode: 'by' | 'without'; labels: string[] } | undefined
      if (peek().type === 'ident' && (peek().text === 'by' || peek().text === 'without')) {
        const mode = next().text as 'by' | 'without'
        grouping = { mode, labels: labelList() }
      }
      expect('(')
      let param: Expr | undefined
      if (name === 'topk') {
        param = expr(0)
        expect(',')
      }
      const inner = expr(0)
      expect(')')
      if (
        !grouping &&
        peek().type === 'ident' &&
        (peek().text === 'by' || peek().text === 'without')
      ) {
        const mode = next().text as 'by' | 'without'
        grouping = { mode, labels: labelList() }
      }
      return { type: 'agg', op: name, ...(param ? { param } : {}), expr: inner, grouping }
    }
    if (peek().text === '(' && peek().type === 'punct') {
      if (!(FUNCTIONS as readonly string[]).includes(name)) {
        if (Object.hasOwn(NOT_HERE, name)) throw notHere(name, t.pos)
        throw new PromqlError(`"${name}" isn't a function: try ${FUNCTIONS.join(', ')}`, t.pos)
      }
      next()
      const args: Expr[] = []
      while (peek().text !== ')') {
        args.push(expr(0))
        if (peek().text === ',') next()
        else if (peek().text !== ')') fail(peek(), '"," or ")"')
      }
      expect(')')
      const want = name === 'histogram_quantile' ? 2 : 1
      if (args.length !== want)
        throw new PromqlError(
          `${name}() takes ${String(want)} argument${want === 1 ? '' : 's'}, not ${String(args.length)}`,
          t.pos,
        )
      return { type: 'call', fn: name, args }
    }
    if (['by', 'without', 'offset', 'bool', 'on', 'ignoring'].includes(name))
      fail(t, 'a metric, a number or a function')
    if (name === 'group_left' || name === 'group_right') throw notHere(name, t.pos)
    const m = peek().text === '{' && peek().type === 'punct' ? matchers() : []
    return { type: 'selector', name, matchers: m, offset: 0 }
  }

  const e = expr(0)
  if (peek().type !== 'eof') fail(peek())
  return e
}
