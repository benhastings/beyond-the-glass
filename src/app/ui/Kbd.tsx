import type { ReactNode } from 'react'

/** A key on the keyboard. Combine with `+` text between them: <Kbd>Ctrl</Kbd>+<Kbd>L</Kbd>. */
export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded-sm border border-b-2 border-line bg-raised px-1.5 py-0.5 font-mono text-[0.9em] text-ink">
      {children}
    </kbd>
  )
}
