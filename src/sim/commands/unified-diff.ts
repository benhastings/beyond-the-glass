/**
 * Unified diff (`diff -u`) between two texts, as `kubectl diff` prints it: hunks with three lines of
 * context and `@@ -a,b +c,d @@` headers. Line-based LCS; manifests are small enough for O(n·m).
 */
export const CONTEXT = 3

type Op = { kind: ' ' | '-' | '+'; line: string; a: number; b: number }

function lines(text: string): string[] {
  if (text === '') return []
  return text.replace(/\n$/, '').split('\n')
}

function ops(a: string[], b: string[]): Op[] {
  const n = a.length
  const m = b.length
  // lcs[i][j]: length of the LCS of a[i..] and b[j..].
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    const row = lcs[i] ?? []
    const below = lcs[i + 1] ?? []
    for (let j = m - 1; j >= 0; j--)
      row[j] = a[i] === b[j] ? (below[j + 1] ?? 0) + 1 : Math.max(below[j] ?? 0, row[j + 1] ?? 0)
  }
  const out: Op[] = []
  let i = 0
  let j = 0
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) {
      out.push({ kind: ' ', line: a[i] ?? '', a: i++, b: j++ })
    } else if (i < n && (j >= m || (lcs[i + 1]?.[j] ?? 0) >= (lcs[i]?.[j + 1] ?? 0))) {
      // Like GNU diff, removals print before the additions that replace them.
      out.push({ kind: '-', line: a[i] ?? '', a: i++, b: j })
    } else {
      out.push({ kind: '+', line: b[j] ?? '', a: i, b: j++ })
    }
  }
  return out
}

const range = (start: number, count: number) =>
  count === 1 ? String(start) : `${String(start)},${String(count)}`

/** The hunks only (no `---`/`+++` header); empty when the texts are the same. */
export function unifiedHunks(before: string, after: string, context = CONTEXT): string {
  const all = ops(lines(before), lines(after))
  const changed = all.map((o, k) => (o.kind !== ' ' ? k : -1)).filter((k) => k >= 0)
  if (!changed.length) return ''
  // Group changes whose context windows touch.
  const groups: [number, number][] = []
  for (const k of changed) {
    const last = groups.at(-1)
    if (last && k - last[1] <= context * 2) last[1] = k
    else groups.push([k, k])
  }
  const out: string[] = []
  for (const [first, lastChange] of groups) {
    const from = Math.max(0, first - context)
    const to = Math.min(all.length - 1, lastChange + context)
    const hunk = all.slice(from, to + 1)
    const aCount = hunk.filter((o) => o.kind !== '+').length
    const bCount = hunk.filter((o) => o.kind !== '-').length
    const head = all[from]
    const aStart = aCount === 0 ? (head?.a ?? 0) : (head?.a ?? 0) + 1
    const bStart = bCount === 0 ? (head?.b ?? 0) : (head?.b ?? 0) + 1
    out.push(`@@ -${range(aStart, aCount)} +${range(bStart, bCount)} @@`)
    for (const o of hunk) out.push(`${o.kind}${o.line}`)
  }
  return out.join('\n')
}
