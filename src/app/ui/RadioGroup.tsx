import { RadioGroup as R } from 'radix-ui'
import { useId, useRef, useState, type FocusEvent, type ReactNode } from 'react'
import { cx, focusRing, target } from './styles'

export interface RadioOption {
  value: string
  label: ReactNode
  /** Extra text under the label (read as the option's description). */
  hint?: ReactNode
}

export interface RadioGroupProps {
  /** The question or group label (visible). */
  legend: ReactNode
  options: RadioOption[]
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  name?: string
}

const ARROWS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'])

/** One choice from several: arrow keys move and select, Tab leaves the group. Each option is a large target. */
export function RadioGroup({
  legend,
  options,
  value,
  defaultValue,
  onValueChange,
  name,
}: RadioGroupProps) {
  const id = useId()
  const [inner, setInner] = useState(defaultValue)
  const current = value ?? inner
  const select = (v: string) => {
    if (v === current) return
    setInner(v)
    onValueChange?.(v)
  }
  // Radix moves focus on arrow keys (in a timeout) and selects on focus only while the key is still
  // down, which misses quick key presses. Remember that an arrow key started the move, and select the
  // option when it actually receives focus.
  const arrowMove = useRef(false)
  const onFocus = (e: FocusEvent<HTMLDivElement>) => {
    if (!arrowMove.current) return
    arrowMove.current = false
    const v = e.target.getAttribute('value')
    if (e.target.getAttribute('role') === 'radio' && v !== null) select(v)
  }
  return (
    <div>
      <p id={`${id}-legend`} className="mb-2 font-bold">
        {legend}
      </p>
      <R.Root
        aria-labelledby={`${id}-legend`}
        className="grid gap-2"
        value={current ?? ''}
        onValueChange={select}
        onKeyDown={(e) => {
          arrowMove.current = ARROWS.has(e.key)
        }}
        onPointerDown={() => {
          arrowMove.current = false
        }}
        onFocus={onFocus}
        {...(name ? { name } : {})}
      >
        {options.map((o) => (
          <label
            key={o.value}
            htmlFor={`${id}-${o.value}`}
            className={cx(
              'flex cursor-pointer items-start gap-3 rounded-md border border-line bg-surface p-3',
              target,
            )}
          >
            <R.Item
              id={`${id}-${o.value}`}
              value={o.value}
              {...(o.hint ? { 'aria-describedby': `${id}-${o.value}-hint` } : {})}
              className={cx(
                'mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border-2 border-line bg-surface',
                focusRing,
              )}
            >
              <R.Indicator className="size-3 rounded-full bg-accent" />
            </R.Item>
            <span>
              {o.label}
              {o.hint && (
                <span id={`${id}-${o.value}-hint`} className="block text-sm text-ink-muted">
                  {o.hint}
                </span>
              )}
            </span>
          </label>
        ))}
      </R.Root>
    </div>
  )
}
