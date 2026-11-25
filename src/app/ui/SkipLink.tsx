import type { MouseEvent, RefObject } from 'react'

/**
 * The first focusable element: jumps keyboard users past the header. A plain `href="#main"` would change
 * the hash route, so it moves focus itself.
 */
export function SkipLink({
  target,
  label = 'Skip to main content',
}: {
  target: RefObject<HTMLElement | null>
  label?: string
}) {
  const skip = (e: MouseEvent) => {
    e.preventDefault()
    target.current?.focus()
  }
  return (
    <a
      href="#main"
      onClick={skip}
      className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-ground focus:p-2 focus:outline-[3px] focus:outline-focus focus:outline-solid"
    >
      {label}
    </a>
  )
}
