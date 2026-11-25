import { useEffect, useRef, useState } from 'react'
import { useProgress } from '.'

/** At most one "Saved" announcement a minute, so screen readers aren't interrupted by every answer. */
export const ANNOUNCE_EVERY_MS = 60_000

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

/**
 * The autosave indicator (E3-04): "Saved 10:42" whenever progress is written. The text updates every
 * time; the polite announcement at most once a minute. When another tab changed progress, says so.
 */
export function SaveStatus() {
  const savedAt = useProgress((s) => s.savedAt)
  const elsewhere = useProgress((s) => s.changedElsewhere)
  const dismiss = useProgress((s) => s.dismissChangedElsewhere)
  const [announced, setAnnounced] = useState('')
  const last = useRef(0)
  useEffect(() => {
    if (!savedAt) return
    const at = Date.parse(savedAt)
    if (at - last.current < ANNOUNCE_EVERY_MS) return
    last.current = at
    setAnnounced(`Progress saved at ${time(savedAt)}.`)
  }, [savedAt])
  return (
    <>
      {savedAt && (
        <span aria-hidden="true" data-testid="saved-indicator">
          Saved {time(savedAt)}
        </span>
      )}
      <span role="status" aria-live="polite" className="sr-only">
        {announced}
      </span>
      <span role="status" aria-live="polite">
        {elsewhere && (
          <span className="ml-2">
            Your progress was updated in another tab, so this one now shows the latest.{' '}
            <button type="button" className="underline" onClick={dismiss}>
              OK
            </button>
          </span>
        )}
      </span>
    </>
  )
}
