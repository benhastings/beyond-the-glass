import type { KeyValueStore } from '@/progress'

/** A Storage stand-in for browsers that block localStorage, and for tests. */
export function memoryStorage(
  initial: Record<string, string> = {},
): KeyValueStore & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial))
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      data.set(k, v)
    },
    removeItem: (k) => {
      data.delete(k)
    },
  }
}
