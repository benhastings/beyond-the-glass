import { useRef, useState, type KeyboardEvent } from 'react'
import { cx, focusRing } from '../../ui/styles'
import type { TypeProps } from './types'

/**
 * Spot-the-bug: the snippet's lines are a listbox, each option read with its line number (E5-03.AC2).
 * Arrow keys move, Enter or Space chooses, and a click does the same.
 */
export function SpotTheBug({ check, value, onChange, idBase }: TypeProps<'spot-the-bug'>) {
  const lines = check.code.replace(/\n$/, '').split('\n')
  const selected = Number(value[0] ?? 0)
  const [active, setActive] = useState(selected || 1)
  const list = useRef<HTMLDivElement>(null)
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const go = (n: number) => {
      e.preventDefault()
      setActive(Math.min(lines.length, Math.max(1, n)))
    }
    if (e.key === 'ArrowDown') go(active + 1)
    else if (e.key === 'ArrowUp') go(active - 1)
    else if (e.key === 'Home') go(1)
    else if (e.key === 'End') go(lines.length)
    else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onChange([String(active)])
    }
  }
  return (
    <div
      ref={list}
      role="listbox"
      tabIndex={0}
      aria-label={`${check.language.toUpperCase()} snippet: choose the line with the bug`}
      aria-activedescendant={`${idBase}-line-${String(active)}`}
      onKeyDown={onKeyDown}
      className={cx(
        'min-w-0 overflow-x-auto rounded-md bg-term-ground py-2 font-mono text-sm text-term-ink',
        focusRing,
      )}
    >
      {lines.map((line, i) => {
        const n = i + 1
        return (
          <div
            key={n}
            id={`${idBase}-line-${String(n)}`}
            role="option"
            aria-selected={selected === n}
            // Options aren't tab stops (the listbox is; aria-activedescendant points at the active line).
            // A click keeps keyboard focus on the listbox, so the arrow keys carry on from the clicked line.
            tabIndex={-1}
            onMouseDown={(e) => {
              e.preventDefault()
              list.current?.focus()
            }}
            onClick={() => {
              setActive(n)
              onChange([String(n)])
            }}
            onKeyDown={(e) => {
              e.stopPropagation()
              onKeyDown(e)
            }}
            className={cx(
              'flex cursor-pointer gap-3 px-2 whitespace-pre',
              active === n && 'outline-2 outline-term-focus outline-dashed',
              selected === n && 'bg-term-surface',
            )}
          >
            {/* The visible number is part of the name: "Line 6: replicas: three". */}
            <span className="w-6 shrink-0 text-right text-term-ink-muted select-none">
              <span className="sr-only">{'Line '}</span>
              {n}
              <span className="sr-only">{': '}</span>
            </span>
            <span>{line || ' '}</span>
            {selected === n && (
              <span aria-hidden="true" className="ml-auto text-term-ink-muted">
                ◀ chosen
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
