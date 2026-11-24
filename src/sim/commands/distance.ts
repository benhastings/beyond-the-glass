/**
 * Optimal string alignment distance (Damerau–Levenshtein without repeated edits): insertions, deletions,
 * substitutions and swaps of adjacent characters each cost 1, so "pdos" is one edit from "pods".
 */
export function editDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [
    i,
    ...Array<number>(b.length).fill(0),
  ])
  for (let j = 0; j <= b.length; j++) (d[0] as number[])[j] = j
  for (let i = 1; i <= a.length; i++) {
    const row = d[i] as number[]
    const prev = d[i - 1] as number[]
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      let v = Math.min(
        (prev[j] as number) + 1,
        (row[j - 1] as number) + 1,
        (prev[j - 1] as number) + cost,
      )
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        v = Math.min(v, ((d[i - 2] as number[])[j - 2] as number) + 1)
      row[j] = v
    }
  }
  return (d[a.length] as number[])[b.length] as number
}

/** Candidates within `max` edits of `word` (and not equal to it), closest first, then alphabetical. */
export function suggest(word: string, candidates: Iterable<string>, max = 2): string[] {
  const w = word.toLowerCase()
  return [...new Set(candidates)]
    .map((c) => ({ c, d: editDistance(w, c.toLowerCase()) }))
    .filter(({ d }) => d > 0 && d <= max)
    .sort((x, y) => x.d - y.d || (x.c < y.c ? -1 : 1))
    .map(({ c }) => c)
}
