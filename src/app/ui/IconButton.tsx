import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cx, focusRing, target } from './styles'
import { Tooltip } from './Tooltip'

export interface IconButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'aria-label' | 'children'
> {
  /** Required: the accessible name, also shown as a tooltip on hover and focus. */
  label: string
  /** The icon (decorative; hidden from assistive technology). */
  icon: ReactNode
}

/** A button with only an icon. It can't be built without a label. */
export function IconButton({ label, icon, className, type = 'button', ...props }: IconButtonProps) {
  return (
    <Tooltip content={label}>
      <button
        type={type}
        aria-label={label}
        className={cx(
          'inline-flex items-center justify-center rounded-md border border-line bg-raised text-ink',
          target,
          focusRing,
          className,
        )}
        {...props}
      >
        <span aria-hidden="true">{icon}</span>
      </button>
    </Tooltip>
  )
}
