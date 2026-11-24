import type { ReactNode } from 'react'

/** Text for assistive technology only. Use when a visual already says the same thing. */
export function VisuallyHidden({ children }: { children: ReactNode }) {
  return <span className="sr-only">{children}</span>
}
