import {
  cloneElement,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react'
import { Button } from './Button'

export interface DialogProps {
  /** Required: the dialog's accessible name. */
  title: string
  /** Read out with the title. */
  description?: ReactNode
  /** The control that opens it (its onClick is added). */
  trigger: ReactElement<{ onClick?: () => void }>
  children?: ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** Label of the closing button (default "Close"). */
  closeLabel?: string
}

/**
 * A modal dialog on the native `<dialog>` element: focus moves in, the page behind is inert, Esc closes
 * it, and focus returns to the trigger. (Native, rather than Radix's, because Radix's scroll lock injects
 * a `<style>` element, which the site's Content-Security-Policy rightly blocks.)
 */
export function Dialog({
  title,
  description,
  trigger,
  children,
  open,
  onOpenChange,
  closeLabel = 'Close',
}: DialogProps) {
  const id = useId()
  const ref = useRef<HTMLDialogElement>(null)
  const [opener, setOpener] = useState<HTMLElement | null>(null)
  const [inner, setInner] = useState(false)
  const isOpen = open ?? inner
  const setOpen = (v: boolean) => {
    setInner(v)
    onOpenChange?.(v)
  }

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (isOpen && !d.open) {
      if (typeof d.showModal === 'function') d.showModal()
      else d.setAttribute('open', '')
      // showModal focuses the first control; make sure of it where it doesn't.
      if (!d.contains(document.activeElement))
        d.querySelector<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        )?.focus()
    }
    if (!isOpen && d.open) {
      if (typeof d.close === 'function') d.close()
      else d.removeAttribute('open')
      opener?.focus()
    }
  }, [isOpen, opener])

  // Esc closes it (browsers do this natively; this also covers environments without <dialog> support).
  useEffect(() => {
    const d = ref.current
    if (!d) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setInner(false)
    }
    d.addEventListener('keydown', onKey)
    return () => {
      d.removeEventListener('keydown', onKey)
    }
  }, [])

  return (
    <>
      {cloneElement(trigger, {
        onClick: () => {
          setOpener(document.activeElement instanceof HTMLElement ? document.activeElement : null)
          setOpen(true)
        },
      })}
      <dialog
        ref={ref}
        aria-labelledby={`${id}-title`}
        {...(description !== undefined ? { 'aria-describedby': `${id}-desc` } : {})}
        onClose={() => {
          setOpen(false)
        }}
        className="m-auto w-[min(36rem,calc(100vw-2rem))] rounded-lg border-2 border-line bg-surface p-6 text-ink shadow-xl backdrop:bg-black/60"
      >
        <h2 id={`${id}-title`} className="text-xl font-bold">
          {title}
        </h2>
        {description !== undefined && (
          <p id={`${id}-desc`} className="mt-2 text-ink-muted">
            {description}
          </p>
        )}
        <div className="mt-4">{children}</div>
        <div className="mt-6 flex justify-end">
          <Button
            onClick={() => {
              setOpen(false)
            }}
          >
            {closeLabel}
          </Button>
        </div>
      </dialog>
    </>
  )
}
