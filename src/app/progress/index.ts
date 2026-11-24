import type { KeyValueStore } from '@/progress'
import { memoryStorage } from './memory-storage'
import { createProgressStore } from './store'

/** localStorage, or an in-memory stand-in when the browser blocks it (the notice then says so). */
function browserStorage(): { store: KeyValueStore; available: boolean } {
  try {
    const s = window.localStorage
    const probe = 'btg:probe'
    s.setItem(probe, '1')
    s.removeItem(probe)
    return { store: s, available: true }
  } catch {
    return { store: memoryStorage(), available: false }
  }
}

const { store, available } = browserStorage()

/** The app's progress store. Use with a selector: `useProgress((s) => s.progress.settings)`. */
export const useProgress = createProgressStore({ backing: store })
if (!available) useProgress.setState({ storageFailure: 'unavailable' })

// Leaving the page (or hiding it on mobile, where pagehide may never come) writes anything pending.
window.addEventListener('pagehide', () => {
  useProgress.storage.flush()
})
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') useProgress.storage.flush()
})

export { createProgressStore, type ProgressState, type ProgressStore } from './store'
export { memoryStorage } from './memory-storage'
