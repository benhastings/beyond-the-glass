import type { ReactNode } from 'react'

/** The "Deep dive" layer of a `<Depth>` (E5-05). On its own it renders its content. */
export function DeepDive({ children }: { children: ReactNode }) {
  return <>{children}</>
}
DeepDive.depth = 'deep' as const
DeepDive.label = 'Deep dive'
