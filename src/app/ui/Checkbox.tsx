import { Checkbox as C } from 'radix-ui'
import { useId, type ReactNode } from 'react'
import { cx, focusRing, target } from './styles'

export interface CheckboxProps {
  label: ReactNode
  checked?: boolean
  defaultChecked?: boolean
  onCheckedChange?: (checked: boolean) => void
  disabled?: boolean
}

/** A labelled checkbox; Space toggles it. The tick is drawn, not just coloured. */
export function Checkbox({
  label,
  checked,
  defaultChecked,
  onCheckedChange,
  disabled,
}: CheckboxProps) {
  const id = useId()
  return (
    <div className={cx('flex items-center gap-3', target)}>
      <C.Root
        id={id}
        {...(checked !== undefined ? { checked } : {})}
        {...(defaultChecked !== undefined ? { defaultChecked } : {})}
        {...(onCheckedChange
          ? {
              onCheckedChange: (c: boolean | 'indeterminate') => {
                onCheckedChange(c === true)
              },
            }
          : {})}
        {...(disabled ? { disabled } : {})}
        className={cx(
          'grid size-6 shrink-0 place-items-center rounded-sm border-2 border-line bg-surface data-[state=checked]:bg-accent',
          focusRing,
        )}
      >
        <C.Indicator className="text-accent-ink">
          <svg aria-hidden="true" viewBox="0 0 16 16" className="size-4">
            <path
              d="M3 8.5l3 3L13 4.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </C.Indicator>
      </C.Root>
      <label htmlFor={id} className="cursor-pointer">
        {label}
      </label>
    </div>
  )
}
