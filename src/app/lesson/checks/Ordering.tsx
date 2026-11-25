import { useState } from 'react'
import { Button } from '../../ui/Button'
import type { TypeProps } from './types'

/** Ordering with Move up / Move down buttons, so it never depends on dragging (E5-03.AC1). */
export function Ordering({ check, value, onChange }: TypeProps<'ordering'>) {
  const [moved, setMoved] = useState('')
  const text = (id: string) => check.items.find((i) => i.id === id)?.text ?? id
  const move = (from: number, to: number) => {
    const next = [...value]
    const [item] = next.splice(from, 1)
    if (item === undefined) return
    next.splice(to, 0, item)
    onChange(next)
    setMoved(`${text(item)} moved to position ${String(to + 1)} of ${String(next.length)}.`)
  }
  return (
    <>
      <ol className="grid gap-2">
        {value.map((id, i) => (
          <li
            key={id}
            className="flex flex-wrap items-center gap-2 rounded-md border border-line p-2"
          >
            <span className="min-w-6 font-bold">{i + 1}.</span>
            <span className="flex-1">{text(id)}</span>
            <Button
              aria-label={`Move “${text(id)}” up`}
              disabled={i === 0}
              onClick={() => {
                move(i, i - 1)
              }}
            >
              ↑ Up
            </Button>
            <Button
              aria-label={`Move “${text(id)}” down`}
              disabled={i === value.length - 1}
              onClick={() => {
                move(i, i + 1)
              }}
            >
              ↓ Down
            </Button>
          </li>
        ))}
      </ol>
      <p role="status" className="sr-only">
        {moved}
      </p>
    </>
  )
}
