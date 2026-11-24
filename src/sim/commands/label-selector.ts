import type { LabelSelector } from '../core/resources.ts'

/**
 * Parses a kubectl `-l/--selector` string: `app=web`, `app==web`, `tier!=db`, `env in (a,b)`,
 * `env notin (a)`, `release`, `!release`, comma-separated. Returns an error message instead of throwing.
 */
export function parseSelector(
  text: string,
): { ok: true; selector: LabelSelector } | { ok: false; error: string } {
  const matchLabels: Record<string, string> = {}
  const matchExpressions: NonNullable<LabelSelector['matchExpressions']> = []
  // Split on commas that aren't inside parentheses.
  const parts: string[] = []
  let depth = 0
  let cur = ''
  for (const c of text) {
    if (c === '(') depth++
    if (c === ')') depth--
    if (c === ',' && depth === 0) {
      parts.push(cur)
      cur = ''
    } else cur += c
  }
  parts.push(cur)
  const key = /^[A-Za-z0-9]([-A-Za-z0-9_./]*[A-Za-z0-9])?$/
  const bad = () => ({
    ok: false as const,
    error: `error: unable to parse requirement: invalid selector "${text}"`,
  })
  for (const raw of parts) {
    const p = raw.trim()
    if (!p) return bad()
    let m: RegExpExecArray | null
    if ((m = /^(\S+?)\s*(==|=|!=)\s*(\S*)$/.exec(p))) {
      const [, k = '', op, v = ''] = m
      if (!key.test(k)) return bad()
      if (op === '!=') matchExpressions.push({ key: k, operator: 'NotIn', values: [v] })
      else matchLabels[k] = v
    } else if ((m = /^(\S+)\s+(in|notin)\s*\(([^)]*)\)$/.exec(p))) {
      const [, k = '', op, vs = ''] = m
      if (!key.test(k)) return bad()
      matchExpressions.push({
        key: k,
        operator: op === 'in' ? 'In' : 'NotIn',
        values: vs
          .split(',')
          .map((v) => v.trim())
          .filter(Boolean),
      })
    } else if ((m = /^!\s*(\S+)$/.exec(p))) {
      if (!key.test(m[1] ?? '')) return bad()
      matchExpressions.push({ key: m[1] ?? '', operator: 'DoesNotExist' })
    } else if (key.test(p)) {
      matchExpressions.push({ key: p, operator: 'Exists' })
    } else return bad()
  }
  return {
    ok: true,
    selector: { matchLabels, ...(matchExpressions.length ? { matchExpressions } : {}) },
  }
}
