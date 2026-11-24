/** A criterion tag from docs/plan/epics: `E6-04.AC2` (issue) or `E6.SC1` (epic). */
export type AcTag = `E${number}-${number}.AC${number}` | `E${number}.SC${number}`

const TAG = /^E\d+-\d+\.AC\d+$|^E\d+\.SC\d+$/

/** Builds a test title that scripts/ac-trace.py traces: `[E6-04.AC2] [E6.SC1] parser never throws`. */
export function acTitle(tags: AcTag | AcTag[], title: string): string {
  const list = Array.isArray(tags) ? tags : [tags]
  if (!list.length) throw new Error('acTest needs at least one tag')
  for (const t of list)
    if (!TAG.test(t)) throw new Error(`"${t}" isn't a criterion tag like E6-04.AC2`)
  return `${list.map((t) => `[${t}]`).join(' ')} ${title}`
}
