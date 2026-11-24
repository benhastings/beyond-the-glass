import type { ProgressState } from './store'

const MESSAGES = {
  quota:
    "Your latest progress couldn't be saved because this browser's storage is full. Export your progress from Settings to keep a copy.",
  unavailable:
    "This browser isn't letting Beyond the Glass save your progress, so it will be lost when you close the tab. Export your progress from Settings to keep a copy.",
} as const

interface Props {
  failure: ProgressState['storageFailure']
  onDismiss: () => void
}

/**
 * Tells the learner when progress can't be saved (E3-01.AC3). The live region is always present, so
 * screen readers announce the message when it appears. E1-03's Toast replaces this styling.
 */
export function StorageNotice({ failure, onDismiss }: Props) {
  return (
    <div role="status" aria-live="polite" className="fixed inset-x-4 bottom-4 mx-auto max-w-xl">
      {failure && (
        <div className="rounded-md border-2 border-current bg-ground p-4 text-ink shadow-lg">
          <p>{MESSAGES[failure]}</p>
          <button type="button" className="mt-2 underline" onClick={onDismiss}>
            Dismiss
          </button>
        </div>
      )}
    </div>
  )
}
