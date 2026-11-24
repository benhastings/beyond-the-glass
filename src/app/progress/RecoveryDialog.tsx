import { useEffect, useRef } from 'react'
import type { Recovery } from '@/progress'

interface Props {
  recovery: Recovery | undefined
  onClose: () => void
}

/** Saves the raw old value as a file the learner can keep, or send to someone who can help. */
function download(raw: string, when: Date) {
  const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `beyond-the-glass-progress-backup-${when.toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Tells the learner, once, that saved progress couldn't be read (E3-02.AC2). A native modal dialog:
 * focus moves into it, Tab stays inside, Esc closes it, and the page behind is inert.
 */
export function RecoveryDialog({ recovery, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog || !recovery) return
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal()
    } else dialog.setAttribute('open', '')
  }, [recovery])

  if (!recovery) return null
  const repaired = recovery.kind === 'repaired'
  return (
    <dialog
      ref={ref}
      aria-labelledby="recovery-title"
      aria-describedby="recovery-body"
      onClose={onClose}
      className="m-auto max-w-lg rounded-lg border-2 border-current bg-ground p-6 text-ink backdrop:bg-black/60"
    >
      <h2 id="recovery-title" className="text-xl font-bold">
        {repaired
          ? 'Some of your saved progress couldn’t be read'
          : 'Your saved progress couldn’t be read'}
      </h2>
      <div id="recovery-body" className="mt-3 space-y-3">
        <p>
          {repaired
            ? 'We kept everything we could read, and you can carry on from there.'
            : 'You’re starting with a fresh record.'}{' '}
          {recovery.backupKey
            ? 'A copy of the old data is kept in this browser, and you can download it.'
            : 'You can download the old data to keep a copy.'}
        </p>
        <p className="text-sm">{recovery.reason}</p>
      </div>
      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          className="rounded border border-current px-4 py-2"
          onClick={() => {
            download(recovery.raw, new Date())
          }}
        >
          Download the old data
        </button>
        <button
          type="button"
          className="rounded border border-current px-4 py-2 font-bold"
          onClick={() => {
            if (typeof ref.current?.close === 'function') ref.current.close()
            onClose()
          }}
        >
          Continue
        </button>
      </div>
    </dialog>
  )
}
