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

/** One row of a unified diff: a hunk header, or a line with its line numbers (1-based) on each side. */
export type DiffRow =
  | { kind: '@'; text: string }
  | { kind: ' '; text: string; oldLine: number; newLine: number }
  | { kind: '-'; text: string; oldLine: number }
  | { kind: '+'; text: string; newLine: number }

/** The rows of a unified diff, for views that show line numbers (E7-03). Empty when the texts match. */
export function diffRows(before: string, after: string, context = CONTEXT): DiffRow[] {
  const all = ops(lines(before), lines(after))
  const changed = all.map((o, k) => (o.kind !== ' ' ? k : -1)).filter((k) => k >= 0)
  if (!changed.length) return []
  // Group changes whose context windows touch.
  const groups: [number, number][] = []
  for (const k of changed) {
    const last = groups.at(-1)
    if (last && k - last[1] <= context * 2) last[1] = k
    else groups.push([k, k])
  }
  const out: DiffRow[] = []
  for (const [first, lastChange] of groups) {
    const from = Math.max(0, first - context)
    const to = Math.min(all.length - 1, lastChange + context)
    const hunk = all.slice(from, to + 1)
    const aCount = hunk.filter((o) => o.kind !== '+').length
    const bCount = hunk.filter((o) => o.kind !== '-').length
    const head = all[from]
    const aStart = aCount === 0 ? (head?.a ?? 0) : (head?.a ?? 0) + 1
    const bStart = bCount === 0 ? (head?.b ?? 0) : (head?.b ?? 0) + 1
    out.push({ kind: '@', text: `@@ -${range(aStart, aCount)} +${range(bStart, bCount)} @@` })
    for (const o of hunk)
      out.push(
        o.kind === ' '
          ? { kind: ' ', text: o.line, oldLine: o.a + 1, newLine: o.b + 1 }
          : o.kind === '-'
            ? { kind: '-', text: o.line, oldLine: o.a + 1 }
            : { kind: '+', text: o.line, newLine: o.b + 1 },
      )
  }
  return out
}

/** The hunks only (no `---`/`+++` header); empty when the texts are the same. */
export function unifiedHunks(before: string, after: string, context = CONTEXT): string {
  return diffRows(before, after, context)
    .map((r) => (r.kind === '@' ? r.text : `${r.kind}${r.text}`))
    .join('\n')
}

/**
 * The classic `diff` output (`57c57`, `<`, `---`, `>`), which `argocd app diff` prints: one block per run of
 * changes, with no context lines.
 */
export function normalDiff(before: string, after: string): string {
  const all = ops(lines(before), lines(after))
  const out: string[] = []
  let k = 0
  while (k < all.length) {
    if (all[k]?.kind === ' ') {
      k++
      continue
    }
    const run: Op[] = []
    while (k < all.length && all[k]?.kind !== ' ') run.push(all[k++] as Op)
    const del = run.filter((o) => o.kind === '-')
    const add = run.filter((o) => o.kind === '+')
    const range = (from: number, n: number) =>
      n <= 1 ? String(from + 1) : `${String(from + 1)},${String(from + n)}`
    const aFrom = del[0]?.a ?? run[0]?.a ?? 0
    const bFrom = add[0]?.b ?? run[0]?.b ?? 0
    const head =
      del.length && add.length
        ? `${range(aFrom, del.length)}c${range(bFrom, add.length)}`
        : del.length
          ? `${range(aFrom, del.length)}d${String(bFrom)}`
          : `${String(aFrom)}a${range(bFrom, add.length)}`
    out.push(
      head,
      ...del.map((o) => `< ${o.line}`),
      ...(del.length && add.length ? ['---'] : []),
      ...add.map((o) => `> ${o.line}`),
    )
  }
  return out.join('\n')
}
