import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, expectTypeOf, it } from 'vitest'
import type { z } from 'zod'
import { acTest } from '@/test/ac'
import { emptyProgress, progressV1, type Progress, type ProgressV1 } from './schema'

const NOW = '2026-11-24T10:00:00.000Z'

/** Every property name the schema accepts, at any depth, as dotted paths (`*` for record keys). */
function fieldPaths(schema: unknown, prefix = ''): string[] {
  const def = (schema as { def?: Record<string, unknown> }).def ?? {}
  switch (def.type) {
    case 'object':
      return Object.entries(def.shape as Record<string, unknown>).flatMap(([k, v]) => [
        `${prefix}${k}`,
        ...fieldPaths(v, `${prefix}${k}.`),
      ])
    case 'record':
      return fieldPaths(def.valueType, `${prefix}*.`)
    case 'optional':
    case 'default':
    case 'nullable':
      return fieldPaths(def.innerType, prefix)
    case 'union':
      return (def.options as unknown[]).flatMap((o) => fieldPaths(o, prefix))
    case 'array':
      return fieldPaths(def.element, prefix)
    default:
      return []
  }
}

describe('ProgressV1 schema', () => {
  acTest('E3-01.AC1', 'the Progress types are inferred from the Zod schema', () => {
    expectTypeOf<ProgressV1>().toEqualTypeOf<z.infer<typeof progressV1>>()
    expectTypeOf<Progress>().toEqualTypeOf<ProgressV1>()
    // No hand-written progress shapes anywhere: types come from the schema only.
    const files = ['src/progress', 'src/app/progress'].flatMap((dir) =>
      readdirSync(dir)
        .filter((f) => /\.tsx?$/.test(f) && !f.includes('.test.'))
        .map((f) => join(dir, f)),
    )
    for (const f of files) {
      expect(readFileSync(f, 'utf8'), f).not.toMatch(
        /^[ \t]*(?:export\s+)?(?:interface\s+Progress(?:V\d+)?\b|type\s+Progress(?:V\d+)?\s*=(?!\s*(?:z\.infer|ProgressV1)\b))/m,
      )
    }
  })

  acTest('E3-01.AC1', 'a fresh record validates and has every section', () => {
    const p = emptyProgress(NOW)
    expect(progressV1.parse(p)).toEqual(p)
    expect(p).toEqual({
      schemaVersion: 1,
      createdAt: NOW,
      updatedAt: NOW,
      threshold: { answers: {}, overrides: {} },
      lessons: {},
      checks: {},
      challenges: {},
      scenarios: {},
      settings: { reduceMotion: 'system', highContrast: 'system', textSize: 100 },
    })
  })

  acTest('E3-01.AC1', 'rejects unknown fields, bad IDs and out-of-range values', () => {
    const p = emptyProgress(NOW)
    expect(progressV1.safeParse({ ...p, email: 'x@example.com' }).success).toBe(false)
    expect(progressV1.safeParse({ ...p, schemaVersion: 2 }).success).toBe(false)
    expect(progressV1.safeParse({ ...p, lessons: { 'Not An ID': {} } }).success).toBe(false)
    expect(progressV1.safeParse({ ...p, settings: { ...p.settings, textSize: 120 } }).success).toBe(
      false,
    )
    expect(progressV1.safeParse({ ...p, displayName: 'x'.repeat(41) }).success).toBe(false)
    expect(progressV1.safeParse({ ...p, challenges: { a: { hintsUsed: -1 } } }).success).toBe(false)
    expect(
      progressV1.safeParse({ ...p, threshold: { placement: { kubernetes: 'expert' } } }).success,
    ).toBe(false)
    expect(progressV1.parse({ ...p, lessons: { 'chartroom/first-look': {} } }).lessons).toEqual({
      'chartroom/first-look': { currentStep: 0, completedSteps: [] },
    })
  })

  acTest('E3-01.AC4', 'the only personal field is an optional display name', () => {
    const paths = fieldPaths(progressV1)
    expect(paths).toContain('displayName')
    const personal = /name|email|mail|phone|address|user|login|account|ip\b|location|birth|age\b/i
    expect(paths.filter((p) => personal.test(p.split('.').pop() ?? ''))).toEqual(['displayName'])
    expect(progressV1.safeParse({ ...emptyProgress(NOW), displayName: undefined }).success).toBe(
      true,
    )
    // The schema is strict at every level, so a personal field can't slip in unnoticed.
    expect(
      progressV1.safeParse({ ...emptyProgress(NOW), settings: { userEmail: 'a' } }).success,
    ).toBe(false)
  })

  it('lists the fields the PII check walks', () => {
    expect(fieldPaths(progressV1)).toEqual(
      expect.arrayContaining([
        'threshold.answers',
        'lessons.*.completedSteps',
        'scenarios.*.notes',
        'settings.textSize',
      ]),
    )
  })
})
