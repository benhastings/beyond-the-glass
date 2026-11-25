import type { GlossaryEntry, RosettaEntry } from './schema.ts'

/**
 * Field Guide search (E2-05), entirely in the browser: glossary terms by name, alias or acronym, and
 * Rosetta Stone rows by either side. Pure, so it's tested for speed with hundreds of entries.
 */
export interface SearchHit {
  kind: 'term' | 'rosetta'
  /** The glossary ID, or the Rosetta row's index. */
  id: string
  title: string
  detail: string
}

interface Doc extends SearchHit {
  /** Lower-case names that count as an exact match: the term, its aliases, its acronym. */
  names: string[]
  /** Lower-case text searched for any match. */
  text: string
}

export type SearchIndex = readonly Doc[]

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9/ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/** "Horizontal Pod Autoscaler" → "hpa". */
const acronym = (s: string) => {
  const words = s.split(/[\s-]+/).filter((w) => /^[A-Za-z]/.test(w))
  return words.length > 1
    ? words
        .map((w) => w[0])
        .join('')
        .toLowerCase()
    : ''
}

export function buildIndex(
  glossary: readonly GlossaryEntry[],
  rosetta: readonly RosettaEntry[] = [],
): SearchIndex {
  return [
    ...glossary.map((t) => ({
      kind: 'term' as const,
      id: t.id,
      title: t.term,
      detail: t.eli5,
      names: [t.term, t.id, ...t.aliases, acronym(t.term)].filter(Boolean).map(norm),
      text: norm([t.term, ...t.aliases, t.eli5, t.operator].join(' ')),
    })),
    ...rosetta.map((r, i) => ({
      kind: 'rosetta' as const,
      id: String(i),
      title: `${r.then} → ${r.now}`,
      detail: r.why,
      names: [norm(r.then), norm(r.now)],
      text: norm([r.then, r.now, r.why].join(' ')),
    })),
  ]
}

/** Exact names first, then names that start with the query, then any match in the text. */
export function search(index: SearchIndex, query: string, limit = 20): SearchHit[] {
  const q = norm(query)
  if (!q) return []
  const scored: [number, Doc][] = []
  for (const d of index) {
    let score = 0
    if (d.names.includes(q)) score = 3
    else if (d.names.some((n) => n.startsWith(q))) score = 2
    else if (d.text.includes(q)) score = 1
    if (score) scored.push([score, d])
  }
  return scored
    .sort((a, b) => b[0] - a[0] || a[1].title.localeCompare(b[1].title))
    .slice(0, limit)
    .map(([, d]) => ({ kind: d.kind, id: d.id, title: d.title, detail: d.detail }))
}
