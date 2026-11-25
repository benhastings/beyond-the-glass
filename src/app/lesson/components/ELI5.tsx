import type { ReactNode } from 'react'

/** The "In plain words" layer of a `<Depth>` (E5-05). On its own it renders its content. */
export function ELI5({ children }: { children: ReactNode }) {
  return <>{children}</>
}
ELI5.depth = 'eli5' as const
ELI5.label = 'In plain words'
