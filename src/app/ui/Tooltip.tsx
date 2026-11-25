import { Tooltip as T } from 'radix-ui'
import type { ReactElement, ReactNode } from 'react'

/**
 * A short description of a control. It opens on hover **and on keyboard focus**, closes on Esc, and is
 * never the only place important information lives.
 */
export function Tooltip({ content, children }: { content: ReactNode; children: ReactElement }) {
  return (
    <T.Provider delayDuration={300}>
      <T.Root>
        <T.Trigger asChild>{children}</T.Trigger>
        <T.Portal>
          <T.Content
            sideOffset={6}
            className="z-50 max-w-xs rounded-md border border-line bg-surface px-3 py-1.5 text-sm text-ink shadow-lg"
          >
            {content}
            <T.Arrow className="fill-surface" />
          </T.Content>
        </T.Portal>
      </T.Root>
    </T.Provider>
  )
}
