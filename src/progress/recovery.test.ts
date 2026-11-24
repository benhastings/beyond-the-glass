import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { acTest } from '@/test/ac'
import type { KeyValueStore } from './persistence'
import { envelope, recoverStoredProgress } from './recovery'
import { emptyProgress, progressV1, PROGRESS_KEY, type Progress } from './schema'

const NOW = '2026-11-24T12:00:00.000Z'
const BACKUP = `${PROGRESS_KEY}:backup:${NOW}`
const V1 = readFileSync(new URL('./__fixtures__/progress-v1.json', import.meta.url), 'utf8')

function store(initial: Record<string, string> = {}, failOn?: (key: string) => boolean) {
  const data = new Map(Object.entries(initial))
  const s: KeyValueStore & { data: Map<string, string> } = {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      if (failOn?.(k)) throw Object.assign(new Error('full'), { name: 'QuotaExceededError' })
      data.set(k, v)
    },
    removeItem: (k) => {
      data.delete(k)
    },
  }
  return s
}

describe('recoverStoredProgress', () => {
  it('does nothing for empty or readable progress', () => {
    const empty = store()
    expect(recoverStoredProgress(empty, NOW)).toBeUndefined()
    expect(empty.data.size).toBe(0)
    const fine = store({ [PROGRESS_KEY]: V1 })
    expect(recoverStoredProgress(fine, NOW)).toBeUndefined()
    expect(fine.data.get(PROGRESS_KEY)).toBe(V1)
  })

  acTest(
    'E3-02.AC1',
    'migrated progress is written back in the current format, with no dialog',
    () => {
      const s = store({ [PROGRESS_KEY]: V1 })
      const v2 = progressV1.extend({
        schemaVersion: z.literal(2),
      }) as unknown as z.ZodType<Progress>
      expect(
        recoverStoredProgress(s, NOW, {
          migrations: { 1: (d) => ({ ...d, schemaVersion: 2 }) },
          version: 2,
          schema: v2,
        }),
      ).toBeUndefined()
      expect(JSON.parse(s.data.get(PROGRESS_KEY) ?? '')).toMatchObject({
        state: { progress: { schemaVersion: 2, displayName: 'Sam' } },
      })
    },
  )

  acTest('E3-02.AC1', 'garbage is backed up, then cleared so the learner starts fresh', () => {
    const s = store({ [PROGRESS_KEY]: '{oops' })
    expect(recoverStoredProgress(s, NOW)).toEqual({
      kind: 'corrupt',
      reason: 'The saved data is not valid JSON.',
      dropped: [],
      raw: '{oops',
      backupKey: BACKUP,
    })
    expect(s.data.get(BACKUP)).toBe('{oops')
    expect(s.data.has(PROGRESS_KEY)).toBe(false)
    // A second load (a reload) finds nothing wrong: one incident, one notice.
    expect(recoverStoredProgress(s, '2026-11-24T12:05:00.000Z')).toBeUndefined()
  })

  acTest('E3-02.AC1', 'a repaired record is backed up and replaced by what could be read', () => {
    const damaged = JSON.stringify({
      state: { progress: { ...emptyProgress(NOW), displayName: 'Ari', checks: 1 } },
      version: 1,
    })
    const s = store({ [PROGRESS_KEY]: damaged })
    expect(recoverStoredProgress(s, NOW)).toMatchObject({
      kind: 'repaired',
      dropped: ['checks'],
      backupKey: BACKUP,
      raw: damaged,
    })
    expect(s.data.get(BACKUP)).toBe(damaged)
    const kept = JSON.parse(s.data.get(PROGRESS_KEY) ?? '') as { state: { progress: Progress } }
    expect(kept.state.progress.displayName).toBe('Ari')
    expect(envelope(kept.state.progress)).toBe(s.data.get(PROGRESS_KEY))
  })

  it('still offers the download when the backup copy can’t be written', () => {
    const s = store({ [PROGRESS_KEY]: 'garbage' }, (k) => k === BACKUP)
    expect(recoverStoredProgress(s, NOW)).toMatchObject({
      kind: 'corrupt',
      raw: 'garbage',
      backupKey: undefined,
    })
  })

  it('gives up quietly when storage can’t be read at all', () => {
    const broken: KeyValueStore = {
      getItem: () => {
        throw new Error('SecurityError')
      },
      setItem: () => undefined,
      removeItem: () => undefined,
    }
    expect(recoverStoredProgress(broken, NOW)).toBeUndefined()
  })
})
