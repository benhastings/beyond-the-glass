import type { ReactNode } from 'react'

/** The "Operator" layer of a `<Depth>` (E5-05). On its own it renders its content. */
export function Operator({ children }: { children: ReactNode }) {
  return <>{children}</>
}
Operator.depth = 'operator' as const
Operator.label = 'Operator'
