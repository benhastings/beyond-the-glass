import { backupKey, loadProgress, type LoadOptions } from './migrations.ts'
import type { KeyValueStore } from './persistence.ts'
import { CURRENT_VERSION, PROGRESS_KEY, type Progress } from './schema.ts'

/** What happened to stored progress that couldn't be read as-is, for the recovery dialog. */
export interface Recovery {
  kind: 'repaired' | 'corrupt'
  /** Plain-language reason (corrupt) or the dropped fields (repaired). */
  reason: string
  dropped: string[]
  /** The stored value exactly as it was, for "Download the old data". */
  raw: string
  /** Where the raw value was copied, or undefined if storage refused the copy. */
  backupKey: string | undefined
}

export const envelope = (progress: Progress) =>
  JSON.stringify({ state: { progress }, version: CURRENT_VERSION })

/**
 * Runs before the store loads: migrates old progress in place, and when something can't be read, copies
 * the raw value to `btg:progress:backup:<time>` first, then leaves a readable record (repaired) or none
 * (corrupt) under `btg:progress`. Returns what the learner should be told, if anything. Never throws.
 */
export function recoverStoredProgress(
  store: KeyValueStore,
  now: string,
  opts: LoadOptions<Progress> = {},
): Recovery | undefined {
  let raw: string | null
  try {
    raw = store.getItem(PROGRESS_KEY)
  } catch {
    return undefined
  }
  const result = loadProgress(raw, now, opts)
  const attempt = (fn: () => void) => {
    try {
      fn()
      return true
    } catch {
      return false
    }
  }
  if (result.kind === 'empty') return undefined
  if (result.kind === 'ok') {
    if (result.migratedFrom !== undefined)
      attempt(() => {
        store.setItem(PROGRESS_KEY, envelope(result.progress))
      })
    return undefined
  }
  const key = backupKey(now)
  const backedUp = attempt(() => {
    store.setItem(key, raw ?? '')
  })
  if (result.kind === 'repaired')
    attempt(() => {
      store.setItem(PROGRESS_KEY, envelope(result.progress))
    })
  else
    attempt(() => {
      store.removeItem(PROGRESS_KEY)
    })
  return {
    kind: result.kind,
    reason:
      result.kind === 'corrupt'
        ? result.reason
        : 'Some parts of the saved progress could not be read.',
    dropped: result.kind === 'repaired' ? result.dropped : [],
    raw: raw ?? '',
    backupKey: backedUp ? key : undefined,
  }
}
