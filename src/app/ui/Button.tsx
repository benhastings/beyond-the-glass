import type { ButtonHTMLAttributes } from 'react'
import { cx, focusRing, target } from './styles'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** primary: the one main action; secondary: everything else; ghost: low-emphasis, in toolbars. */
  variant?: 'primary' | 'secondary' | 'ghost'
}

const VARIANTS = {
  primary: 'bg-accent text-accent-ink border-2 border-accent font-bold',
  secondary: 'bg-raised text-ink border border-line',
  ghost: 'bg-transparent text-ink border border-transparent underline-offset-4 hover:underline',
} as const

/** A real `<button>` (type="button" unless told otherwise), 44 px tall, with the mood's focus ring. */
export function Button({
  variant = 'secondary',
  className,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-md px-4 disabled:cursor-not-allowed disabled:opacity-60',
        target,
        focusRing,
        VARIANTS[variant],
        className,
      )}
      {...props}
    />
  )
}
