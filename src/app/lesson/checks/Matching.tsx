import { stableShuffle } from '@/content/checks'
import type { TypeProps } from './types'

/** Matching with a labelled select per item (works with any keyboard and screen reader). */
export function Matching({ check, value, onChange, idBase }: TypeProps<'matching'>) {
  const rights = stableShuffle(check.id, check.pairs)
  const chosen = (left: string) => value.find((v) => v.startsWith(`${left}=`))?.split('=')[1] ?? ''
  return (
    <div className="grid min-w-0 gap-3">
      {check.pairs.map((p) => (
        <div
          key={p.id}
          className="grid min-w-0 gap-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:items-center"
        >
          <label htmlFor={`${idBase}-${p.id}`} className="font-mono">
            {p.left}
          </label>
          <select
            id={`${idBase}-${p.id}`}
            value={chosen(p.id)}
            onChange={(e) => {
              const rest = value.filter((v) => !v.startsWith(`${p.id}=`))
              onChange(e.target.value ? [...rest, `${p.id}=${e.target.value}`] : rest)
            }}
            className="min-h-11 w-full min-w-0 rounded-md border border-line bg-raised px-2"
          >
            <option value="">Choose…</option>
            {rights.map((r) => (
              <option key={r.id} value={r.id}>
                {r.right}
              </option>
            ))}
          </select>
        </div>
      ))}
    </div>
  )
}
