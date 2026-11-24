import { Dialog as D } from 'radix-ui'
import type { ReactElement, ReactNode } from 'react'
import { Button } from './Button'

export interface DialogProps {
  /** Required: the dialog's accessible name. */
  title: string
  /** Read out with the title. */
  description?: ReactNode
  /** The control that opens it. */
  trigger: ReactElement
  children?: ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** Label of the closing button (default "Close"). */
  closeLabel?: string
}

/** A modal dialog: focus moves in and stays inside, Esc closes it, and focus returns to the trigger. */
export function Dialog({
  title,
  description,
  trigger,
  children,
  open,
  onOpenChange,
  closeLabel = 'Close',
}: DialogProps) {
  return (
    <D.Root {...(open !== undefined ? { open } : {})} {...(onOpenChange ? { onOpenChange } : {})}>
      <D.Trigger asChild>{trigger}</D.Trigger>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-40 bg-black/60" />
        <D.Content
          className="fixed top-1/2 left-1/2 z-50 w-[min(36rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-lg border-2 border-line bg-surface p-6 text-ink shadow-xl"
          {...(description === undefined ? { 'aria-describedby': undefined } : {})}
        >
          <D.Title className="text-xl font-bold">{title}</D.Title>
          {description !== undefined && (
            <D.Description className="mt-2 text-ink-muted">{description}</D.Description>
          )}
          <div className="mt-4">{children}</div>
          <div className="mt-6 flex justify-end">
            <D.Close asChild>
              <Button>{closeLabel}</Button>
            </D.Close>
          </div>
        </D.Content>
      </D.Portal>
    </D.Root>
  )
}
