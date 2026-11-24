import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { acTest } from '@/test/ac'
import {
  debouncedStore,
  isQuotaError,
  WRITE_INTERVAL_MS,
  type KeyValueStore,
  type StorageFailure,
} from './persistence'

function backing(): KeyValueStore & {
  writes: [string, string | null][]
  data: Map<string, string>
  fail?: unknown
} {
  const data = new Map<string, string>()
  const s = {
    data,
    writes: [] as [string, string | null][],
    fail: undefined as Error | undefined,
    getItem: (k: string) => {
      if (s.fail) throw s.fail
      return data.get(k) ?? null
    },
    setItem: (k: string, v: string) => {
      if (s.fail) throw s.fail
      s.writes.push([k, v])
      data.set(k, v)
    },
    removeItem: (k: string) => {
      s.writes.push([k, null])
      data.delete(k)
    },
  }
  return s
}

const quota = Object.assign(new Error('full'), { name: 'QuotaExceededError' })

describe('debouncedStore', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('writes at most once per 500 ms, latest value wins', () => {
    const b = backing()
    const s = debouncedStore(b, () => undefined)
    for (let i = 0; i < 20; i++) {
      s.setItem('k', String(i))
      vi.advanceTimersByTime(50)
    }
    // 1000 ms of changes every 50 ms → two writes, not twenty.
    expect(b.writes).toEqual([
      ['k', '9'],
      ['k', '19'],
    ])
    expect(WRITE_INTERVAL_MS).toBe(500)
  })

  it('reads see pending values', () => {
    const b = backing()
    const s = debouncedStore(b, () => undefined)
    s.setItem('k', 'v')
    expect(s.pending).toBe(true)
    expect(s.getItem('k')).toBe('v')
    expect(b.data.has('k')).toBe(false)
    s.removeItem('k')
    expect(s.getItem('k')).toBeNull()
    vi.advanceTimersByTime(500)
    expect(s.pending).toBe(false)
    expect(b.writes).toEqual([['k', null]])
  })

  it('flushes synchronously (for pagehide)', () => {
    const b = backing()
    const s = debouncedStore(b, () => undefined)
    s.setItem('k', 'v')
    s.flush()
    expect(b.writes).toEqual([['k', 'v']])
    vi.advanceTimersByTime(1000)
    expect(b.writes).toHaveLength(1)
    s.flush()
    expect(b.writes).toHaveLength(1)
  })

  acTest(
    'E3-01.AC3',
    'a full storage is reported, never thrown, and the write is retried later',
    () => {
      const b = backing()
      const failures: StorageFailure[] = []
      const s = debouncedStore(b, (f) => failures.push(f))
      b.fail = quota
      s.setItem('k', 'v1')
      expect(() => {
        vi.advanceTimersByTime(500)
      }).not.toThrow()
      expect(failures.map((f) => f.kind)).toEqual(['quota'])
      expect(s.pending).toBe(true)
      b.fail = undefined
      s.setItem('k', 'v2')
      vi.advanceTimersByTime(500)
      expect(b.data.get('k')).toBe('v2')
      expect(s.pending).toBe(false)
    },
  )

  acTest('E3-01.AC3', 'other storage errors are reported as unavailable, reads included', () => {
    const b = backing()
    const failures: StorageFailure[] = []
    const s = debouncedStore(b, (f) => failures.push(f))
    b.fail = new Error('SecurityError')
    expect(s.getItem('k')).toBeNull()
    s.setItem('k', 'v')
    s.flush()
    expect(failures.map((f) => f.kind)).toEqual(['unavailable', 'unavailable'])
  })

  it('recognises every browser’s quota error', () => {
    expect(isQuotaError(quota)).toBe(true)
    expect(isQuotaError({ name: 'NS_ERROR_DOM_QUOTA_REACHED' })).toBe(true)
    expect(isQuotaError({ code: 22 })).toBe(true)
    expect(isQuotaError({ code: 1014 })).toBe(true)
    expect(isQuotaError(new Error('x'))).toBe(false)
    expect(isQuotaError('QuotaExceededError')).toBe(false)
    expect(isQuotaError(null)).toBe(false)
  })
})
