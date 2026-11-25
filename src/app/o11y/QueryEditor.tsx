import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { cx, focusRing } from '../ui/styles'

export interface Suggestion {
  text: string
  kind: 'metric' | 'label' | 'function'
  detail?: string
}

/** The word being typed at the caret: metric, label and function names. */
function wordAt(value: string, caret: number): { start: number; word: string } {
  const before = value.slice(0, caret)
  const m = /[a-zA-Z_:][a-zA-Z0-9_:]*$/.exec(before)
  return { start: m ? caret - m[0].length : caret, word: m?.[0] ?? '' }
}

/**
 * A labelled query field with autocomplete (E8-03.AC3): the WAI-ARIA combobox pattern with a list popup.
 * Typing a name opens suggestions; Down and Up move through them, Enter or Tab takes one, Esc closes them,
 * and Enter with none chosen runs the query.
 */
export function QueryEditor({
  label,
  value,
  onChange,
  onRun,
  suggestions,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  onRun: () => void
  suggestions: readonly Suggestion[]
}) {
  const id = useId()
  const input = useRef<HTMLInputElement>(null)
  const [caret, setCaret] = useState(value.length)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  // After taking a suggestion, the caret goes to its end as soon as React has put the new value in.
  const pendingCaret = useRef<number | undefined>(undefined)
  useLayoutEffect(() => {
    const pos = pendingCaret.current
    if (pos === undefined) return
    pendingCaret.current = undefined
    input.current?.setSelectionRange(pos, pos)
  }, [value])
  const { start, word } = wordAt(value, caret)
  const options = word
    ? suggestions.filter((s) => s.text.startsWith(word) && s.text !== word).slice(0, 8)
    : []
  const expanded = open && options.length > 0
  const accept = (s: Suggestion) => {
    const next = `${value.slice(0, start)}${s.text}${value.slice(caret)}`
    const pos = start + s.text.length
    pendingCaret.current = pos
    onChange(next)
    setCaret(pos)
    setOpen(false)
    setActive(-1)
  }
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!options.length) return
      e.preventDefault()
      setOpen(true)
      setActive((a) =>
        e.key === 'ArrowDown' ? (a + 1) % options.length : a <= 0 ? options.length - 1 : a - 1,
      )
    } else if ((e.key === 'Enter' || e.key === 'Tab') && expanded && active >= 0) {
      e.preventDefault()
      const s = options[active]
      if (s) accept(s)
    } else if (e.key === 'Escape' && expanded) {
      e.preventDefault()
      setOpen(false)
      setActive(-1)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      setOpen(false)
      onRun()
    }
  }
  return (
    <div className="relative grid gap-1">
      <label htmlFor={`${id}-input`} className="font-bold">
        {label}
      </label>
      <input
        ref={input}
        id={`${id}-input`}
        role="combobox"
        aria-expanded={expanded}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        aria-describedby={`${id}-help`}
        {...(expanded && active >= 0
          ? { 'aria-activedescendant': `${id}-opt-${String(active)}` }
          : {})}
        autoComplete="off"
        spellCheck={false}
        className={cx(
          'min-h-11 w-full rounded-md border border-line bg-term-ground px-3 font-mono text-sm text-term-ink',
          focusRing,
        )}
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          setCaret(e.target.selectionStart ?? e.target.value.length)
          setOpen(true)
          setActive(-1)
        }}
        onSelect={(e) => {
          setCaret(e.currentTarget.selectionStart ?? value.length)
        }}
        onBlur={() => {
          setOpen(false)
        }}
        onKeyDown={onKeyDown}
      />
      <p id={`${id}-help`} className="text-sm text-ink-muted">
        Enter runs the query. While suggestions show, Down and Up choose one and Enter or Tab takes
        it.
      </p>
      <p className="sr-only" aria-live="polite">
        {expanded ? `${String(options.length)} suggestion${options.length === 1 ? '' : 's'}` : ''}
      </p>
      <div
        id={`${id}-list`}
        role="listbox"
        aria-label={`Suggestions for ${label}`}
        className={cx(
          'absolute top-full z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border border-line bg-raised shadow',
          !expanded && 'hidden',
        )}
      >
        {options.map((s, i) => (
          <div
            key={`${s.kind}:${s.text}`}
            id={`${id}-opt-${String(i)}`}
            role="option"
            // Focus stays in the field (aria-activedescendant); options are never tab stops.
            tabIndex={-1}
            aria-selected={i === active}
            className={cx(
              'flex cursor-pointer justify-between gap-3 px-3 py-2 text-sm',
              i === active && 'bg-accent text-accent-ink',
            )}
            onMouseDown={(e) => {
              e.preventDefault()
              accept(s)
            }}
          >
            <span className="font-mono">{s.text}</span>
            <span className={cx('text-xs', i === active ? 'text-accent-ink' : 'text-ink-muted')}>
              {s.detail ?? s.kind}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
