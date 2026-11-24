/**
 * Debounced, failure-tolerant writes for the progress store. The storage itself is injected, so this
 * module never touches a browser global and can be tested in Node.
 */

/** The subset of the Web Storage API the store needs. */
export interface KeyValueStore {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
}

export type StorageFailure = { kind: 'quota' | 'unavailable'; key: string; error: unknown }

export interface DebouncedStore extends KeyValueStore {
  /** Writes anything pending now (call on `pagehide`). */
  flush: () => void
  /** Whether a write is waiting. */
  readonly pending: boolean
}

interface Timers {
  set: (fn: () => void, ms: number) => unknown
  clear: (handle: unknown) => void
}

const defaultTimers: Timers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (h) => {
    clearTimeout(h as ReturnType<typeof setTimeout>)
  },
}

export const WRITE_INTERVAL_MS = 500

/** Whether an error thrown by `setItem` means the storage is full (the name differs between browsers). */
export function isQuotaError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const e = error as { name?: unknown; code?: unknown }
  return (
    e.name === 'QuotaExceededError' ||
    e.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    e.code === 22 ||
    e.code === 1014
  )
}

/**
 * Wraps a store so writes happen at most once per `intervalMs` (the latest value wins) and never throw:
 * a failed write calls `onError` and the value stays pending, so a later write or flush retries it.
 * `onSaved` runs after a write leaves nothing pending.
 * Reads see pending values.
 */
export function debouncedStore(
  backing: KeyValueStore,
  onError: (failure: StorageFailure) => void,
  intervalMs = WRITE_INTERVAL_MS,
  timers: Timers = defaultTimers,
  onSaved?: () => void,
): DebouncedStore {
  const queued = new Map<string, string | null>()
  let timer: unknown

  const write = () => {
    timer = undefined
    for (const [key, value] of [...queued]) {
      try {
        if (value === null) backing.removeItem(key)
        else backing.setItem(key, value)
        queued.delete(key)
      } catch (error) {
        onError({ kind: isQuotaError(error) ? 'quota' : 'unavailable', key, error })
      }
    }
    if (queued.size === 0) onSaved?.()
  }

  // One trailing timer per window: however many changes arrive, at most one write per interval.
  const schedule = () => {
    timer ??= timers.set(write, intervalMs)
  }

  return {
    getItem: (key) => {
      if (queued.has(key)) return queued.get(key) ?? null
      try {
        return backing.getItem(key)
      } catch (error) {
        onError({ kind: 'unavailable', key, error })
        return null
      }
    },
    setItem: (key, value) => {
      queued.set(key, value)
      schedule()
    },
    removeItem: (key) => {
      queued.set(key, null)
      schedule()
    },
    flush: () => {
      if (timer !== undefined) timers.clear(timer)
      write()
    },
    get pending() {
      return queued.size > 0
    },
  }
}
