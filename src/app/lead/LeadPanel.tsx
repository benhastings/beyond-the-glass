import { useId, useState } from 'react'
import { courseOutline, type Manifest } from '@/content'
import { PLACEMENT_DOMAINS } from '@/placement'
import { decodeProgress, summarize, type Progress, type ProgressSummary } from '@/progress'
import { useManifest } from '../content'
import { Button } from '../ui/Button'

const DOMAIN_SHORT: Record<string, string> = {
  foundations: 'Foundations',
  containers: 'Containers',
  kubernetes: 'Kubernetes',
  delivery: 'Delivery',
  observability: 'Observability',
}
const LEVEL: Record<string, string> = {
  wayfarer: 'Wayfarer',
  deckhand: 'Deckhand',
  navigator: 'Navigator',
  pathfinder: 'Pathfinder',
}

export interface Row {
  line: number
  summary: ProgressSummary
  capstone: 'complete' | 'in progress' | 'not started'
}

/** Decodes pasted codes, one per line, in memory only. Bad lines are reported; good ones still show. */
export async function readCodes(
  text: string,
  manifest: Manifest,
  now: string,
): Promise<{ rows: Row[]; errors: { line: number; error: string }[] }> {
  const outline = courseOutline(manifest)
  const capstone = manifest.regions.find((r) => r.mood === 'stormwatch')
  const capstoneLessons = capstone?.modules.flatMap((m) => m.lessons.map((l) => l.id)) ?? []
  const rows: Row[] = []
  const errors: { line: number; error: string }[] = []
  const lines = text
    .split('\n')
    .map((l, i) => [i + 1, l.trim()] as const)
    .filter(([, l]) => l)
  await Promise.all(
    lines.map(async ([line, code]) => {
      const r = await decodeProgress(code, now)
      if (!r.ok) {
        errors.push({ line, error: r.error })
        return
      }
      const p: Progress = r.progress
      const summary = summarize(p, outline)
      const started = capstoneLessons.some((id) => p.lessons[id] !== undefined)
      rows.push({
        line,
        summary,
        capstone:
          capstone && summary.regionsCompleted.includes(capstone.id)
            ? 'complete'
            : started
              ? 'in progress'
              : 'not started',
      })
    }),
  )
  rows.sort((a, b) => a.line - b.line)
  errors.sort((a, b) => a.line - b.line)
  return { rows, errors }
}

type SortKey = 'name' | 'regions' | 'activity' | (typeof PLACEMENT_DOMAINS)[number]

/**
 * The lead view (E3-05): paste learners' progress codes and see where each is. Read-only: nothing pasted
 * is stored, and the table can be sorted from the keyboard and printed.
 */
export function LeadPanel() {
  const manifest = useManifest()
  const [text, setText] = useState('')
  const [result, setResult] = useState<Awaited<ReturnType<typeof readCodes>>>()
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'name', dir: 1 })
  const id = useId()
  const value = (r: Row, key: SortKey): string | number => {
    if (key === 'name') return (r.summary.displayName ?? `Line ${String(r.line)}`).toLowerCase()
    if (key === 'regions') return r.summary.regionsCompleted.length
    if (key === 'activity') return r.summary.lastActivity
    return ['wayfarer', 'deckhand', 'navigator', 'pathfinder'].indexOf(
      r.summary.placement[key] ?? '',
    )
  }
  const rows = [...(result?.rows ?? [])].sort((a, b) => {
    const x = value(a, sort.key)
    const y = value(b, sort.key)
    return (x < y ? -1 : x > y ? 1 : 0) * sort.dir
  })
  const header = (key: SortKey, label: string) => (
    <th
      scope="col"
      aria-sort={sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}
      className="p-2"
    >
      <button
        type="button"
        className="font-bold underline underline-offset-4"
        onClick={() => {
          setSort((s) => ({ key, dir: s.key === key ? (-s.dir as 1 | -1) : 1 }))
        }}
      >
        {label}
        <span aria-hidden="true">{sort.key === key ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}</span>
      </button>
    </th>
  )
  return (
    <div className="grid gap-6">
      <form
        className="grid max-w-prose gap-2 print:hidden"
        onSubmit={(e) => {
          e.preventDefault()
          void readCodes(text, manifest, new Date().toISOString()).then(setResult)
        }}
      >
        <label htmlFor={`${id}-codes`} className="font-bold">
          Progress codes, one per line
        </label>
        <p id={`${id}-help`} className="text-sm">
          Learners find their code under Settings → Your Pack. Nothing you paste here is saved.
        </p>
        <textarea
          id={`${id}-codes`}
          aria-describedby={`${id}-help`}
          value={text}
          onChange={(e) => {
            setText(e.target.value)
          }}
          rows={6}
          className="w-full rounded-md border border-line bg-raised p-2 font-mono text-sm"
        />
        <div className="flex flex-wrap gap-3">
          <Button type="submit" variant="primary" disabled={!text.trim()}>
            Show progress
          </Button>
          {result && result.rows.length > 0 && (
            <Button
              onClick={() => {
                window.print()
              }}
            >
              Print summary
            </Button>
          )}
        </div>
      </form>
      {result && (
        <>
          <p role="status">
            {result.rows.length} {result.rows.length === 1 ? 'learner' : 'learners'}
            {result.errors.length
              ? `; ${String(result.errors.length)} ${result.errors.length === 1 ? 'line' : 'lines'} couldn’t be read`
              : ''}
            .
          </p>
          {result.errors.length > 0 && (
            <ul className="grid gap-1" aria-label="Lines that couldn’t be read">
              {result.errors.map((e) => (
                <li key={e.line}>
                  Line {e.line}: {e.error}
                </li>
              ))}
            </ul>
          )}
          {rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <caption className="text-left font-bold">
                  Learners’ progress (select a column heading to sort)
                </caption>
                <thead>
                  <tr className="border-b-2 border-line">
                    {header('name', 'Name')}
                    {PLACEMENT_DOMAINS.map((d) => header(d, DOMAIN_SHORT[d] ?? d))}
                    {header('regions', 'Regions complete')}
                    <th scope="col" className="p-2">
                      Modules tested out
                    </th>
                    <th scope="col" className="p-2">
                      Capstone
                    </th>
                    {header('activity', 'Last activity')}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.line} className="border-b border-line">
                      <th scope="row" className="p-2 font-normal">
                        {r.summary.displayName ?? `Line ${String(r.line)}`}
                      </th>
                      {PLACEMENT_DOMAINS.map((d) => (
                        <td key={d} className="p-2">
                          {LEVEL[r.summary.placement[d] ?? ''] ?? '–'}
                        </td>
                      ))}
                      <td className="p-2">
                        {r.summary.regionsCompleted.length} of {manifest.regions.length}
                      </td>
                      <td className="p-2">{r.summary.modulesTestedOut}</td>
                      <td className="p-2">{r.capstone}</td>
                      <td className="p-2">{r.summary.lastActivity.slice(0, 10)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
