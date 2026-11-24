import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { acTest } from '@/test/ac'
import { backupKey, BACKUP_PREFIX, loadProgress, MIGRATIONS, type Migration } from './migrations'
import { CURRENT_VERSION, emptyProgress, progressV1, PROGRESS_KEY, type Progress } from './schema'

const NOW = '2026-11-24T12:00:00.000Z'
const V1 = readFileSync(new URL('./__fixtures__/progress-v1.json', import.meta.url), 'utf8')
const wrap = (progress: unknown, version: unknown = 1) =>
  JSON.stringify({ state: { progress }, version })

/** A pretend version 2: adds a `bookmarks` list and renames nothing else. */
const progressV2 = progressV1.extend({
  schemaVersion: z.literal(2),
  bookmarks: z.array(z.string()).default([]),
})
const toV2: Migration = (d) => ({ ...d, schemaVersion: 2, bookmarks: ['first-look'] })

describe('loadProgress', () => {
  it('reads current progress as-is', () => {
    const r = loadProgress(V1, NOW)
    expect(r.kind).toBe('ok')
    if (r.kind === 'ok') {
      expect(r.migratedFrom).toBeUndefined()
      expect(r.progress.displayName).toBe('Sam')
      expect(r.progress.lessons['what-changed']?.completedAt).toBe('2026-11-02T10:00:00.000Z')
    }
    expect(loadProgress(null, NOW)).toEqual({ kind: 'empty' })
    expect(CURRENT_VERSION).toBe(1)
    expect(Object.keys(MIGRATIONS)).toEqual([])
  })

  acTest('E3-02.AC1', 'a v1 fixture migrates through a dummy v2 migration', () => {
    const r = loadProgress(V1, NOW, {
      migrations: { 1: toV2 },
      version: 2,
      schema: progressV2 as unknown as z.ZodType<Progress>,
    })
    expect(r.kind).toBe('ok')
    if (r.kind !== 'ok') return
    expect(r.migratedFrom).toBe(1)
    const v2 = r.progress as unknown as z.infer<typeof progressV2>
    expect(v2.schemaVersion).toBe(2)
    expect(v2.bookmarks).toEqual(['first-look'])
    // Nothing else was lost on the way.
    const original = (JSON.parse(V1) as { state: { progress: Progress } }).state.progress
    expect({ ...v2, schemaVersion: 1, bookmarks: undefined }).toEqual({
      ...progressV1.parse(original),
      bookmarks: undefined,
    })
  })

  acTest(
    'E3-02.AC1',
    'migrations run in order across several versions, and gaps or failures are reported',
    () => {
      const steps: number[] = []
      const r = loadProgress(wrap({ schemaVersion: 1 }), NOW, {
        migrations: {
          1: (d) => (steps.push(1), { ...d, schemaVersion: 2 }),
          2: (d) => (steps.push(2), { ...d, schemaVersion: 3, createdAt: NOW, updatedAt: NOW }),
        },
        version: 3,
        schema: progressV1.extend({
          schemaVersion: z.literal(3),
        }) as unknown as z.ZodType<Progress>,
      })
      expect(steps).toEqual([1, 2])
      expect(r).toMatchObject({ kind: 'ok', migratedFrom: 1 })
      expect(loadProgress(V1, NOW, { migrations: {}, version: 2 })).toEqual({
        kind: 'corrupt',
        reason: 'There is no way to upgrade saved data from version 1.',
      })
      const throws: Migration = () => {
        throw new Error('bad')
      }
      expect(loadProgress(V1, NOW, { migrations: { 1: throws }, version: 2 })).toEqual({
        kind: 'corrupt',
        reason: 'Upgrading the saved data from version 1 failed.',
      })
      expect(
        loadProgress(V1, NOW, {
          migrations: { 1: (d) => ({ ...d, schemaVersion: 2, bogus: 1 }) },
          version: 2,
          schema: progressV2 as unknown as z.ZodType<Progress>,
        }),
      ).toEqual({ kind: 'corrupt', reason: 'The saved data does not match the expected shape.' })
    },
  )

  acTest('E3-02.AC1', 'garbage triggers recovery', () => {
    for (const [raw, reason] of [
      ['{not json', 'The saved data is not valid JSON.'],
      ['', 'The saved data is not valid JSON.'],
      ['42', 'The saved data has no progress record in it.'],
      ['null', 'The saved data has no progress record in it.'],
      [JSON.stringify({ state: {} }), 'The saved data has no progress record in it.'],
      [JSON.stringify({ state: { progress: [] } }), 'The saved data has no progress record in it.'],
      [JSON.stringify({ state: { progress: {} } }), 'The saved data has no version number.'],
      [wrap({}, 'one'), 'The saved data has no version number.'],
      [wrap({ schemaVersion: 0 }), 'The saved data has no version number.'],
      [
        wrap({ schemaVersion: 9 }),
        'The saved data is from a newer version of the app (version 9).',
      ],
      [
        wrap({ schemaVersion: 1, lessons: 'nope', checks: 7 }),
        'None of the saved progress could be read.',
      ],
    ] as const) {
      expect(loadProgress(raw, NOW), raw).toEqual({ kind: 'corrupt', reason })
    }
  })

  acTest('E3-02.AC1', 'partial objects are repaired, keeping every part that validates', () => {
    const original = (JSON.parse(V1) as { state: { progress: Record<string, unknown> } }).state
      .progress
    const damaged = {
      ...original,
      displayName: 'x'.repeat(99),
      threshold: {
        ...(original.threshold as object),
        placement: { kubernetes: 'expert' },
        answers: 'lost',
      },
      lessons: {
        ...(original.lessons as object),
        'Bad ID': { currentStep: 0 },
        broken: { currentStep: -1 },
      },
      checks: 'scrambled',
      settings: { reduceMotion: 'on', highContrast: 'blinding', textSize: 115 },
      unknownField: true,
    }
    const r = loadProgress(wrap(damaged), NOW)
    expect(r.kind).toBe('repaired')
    if (r.kind !== 'repaired') return
    expect(r.dropped.sort()).toEqual(
      [
        'displayName',
        'threshold.answers',
        'threshold.placement',
        'lessons.Bad ID',
        'lessons.broken',
        'checks',
        'settings.highContrast',
      ].sort(),
    )
    const p = r.progress
    expect(progressV1.safeParse(p).success).toBe(true)
    expect(p.createdAt).toBe(original.createdAt)
    expect(p.updatedAt).toBe(NOW)
    expect('displayName' in p).toBe(false)
    expect(p.threshold).toEqual({
      answers: {},
      completedAt: '2026-11-01T09:12:00.000Z',
      overrides: { kubernetes: 'wayfarer' },
      startRegion: 'helm-keep',
    })
    expect(Object.keys(p.lessons)).toEqual(['first-look', 'what-changed'])
    expect(p.checks).toEqual({})
    expect(p.challenges).toEqual((original as { challenges: unknown }).challenges)
    expect(p.settings).toEqual({ reduceMotion: 'on', highContrast: 'system', textSize: 115 })
  })

  it('repairs a record whose sections are entirely the wrong shape', () => {
    const r = loadProgress(
      wrap({ schemaVersion: 1, createdAt: NOW, threshold: 'x', settings: 5, scenarios: [] }),
      NOW,
    )
    expect(r).toMatchObject({
      kind: 'repaired',
      dropped: expect.arrayContaining(['threshold', 'settings', 'scenarios']) as unknown,
    })
    if (r.kind === 'repaired') expect(r.progress).toEqual({ ...emptyProgress(NOW), createdAt: NOW })
  })

  it('names backups under btg:progress:backup:<time>', () => {
    expect(backupKey(NOW)).toBe(`${PROGRESS_KEY}:backup:${NOW}`)
    expect(BACKUP_PREFIX).toBe('btg:progress:backup:')
  })
})
