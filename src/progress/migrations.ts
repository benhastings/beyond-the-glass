import type { z } from 'zod'
import {
  CURRENT_VERSION,
  emptyProgress,
  progressV1,
  PROGRESS_KEY,
  type Progress,
} from './schema.ts'

/**
 * Loading stored progress safely (E3-02): migrate old versions forward, repair what can be repaired,
 * and report anything unreadable so the app can back it up and tell the learner. Pure: no storage access.
 */

/** Upgrades stored data from version N to N+1. Pure; may assume its input is valid version-N data. */
export type Migration = (data: Record<string, unknown>) => Record<string, unknown>

/**
 * `MIGRATIONS[n]` upgrades version n to n+1. Add one whenever `CURRENT_VERSION` goes up, with a fixture
 * of the old version in `__fixtures__/` and a test that loads it.
 */
export const MIGRATIONS: Readonly<Record<number, Migration>> = {}

export const BACKUP_PREFIX = `${PROGRESS_KEY}:backup:`

export function backupKey(now: string): string {
  return `${BACKUP_PREFIX}${now}`
}

export type LoadResult =
  /** Nothing stored yet. */
  | { kind: 'empty' }
  /** Read as-is, or after migrating from an older version. */
  | { kind: 'ok'; progress: Progress; migratedFrom?: number }
  /** Partly readable: these fields (dotted paths) were dropped; the rest was kept. */
  | { kind: 'repaired'; progress: Progress; dropped: string[] }
  /** Unreadable: nothing could be kept. */
  | { kind: 'corrupt'; reason: string }

export interface LoadOptions<P> {
  migrations?: Readonly<Record<number, Migration>>
  version?: number
  schema?: z.ZodType<P>
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * Reads the stored value of `btg:progress`: the persist envelope `{ state: { progress }, version }`.
 * Never throws.
 */
export function loadProgress(
  raw: string | null,
  now: string,
  opts: LoadOptions<Progress> = {},
): LoadResult {
  const migrations = opts.migrations ?? MIGRATIONS
  const current = opts.version ?? CURRENT_VERSION
  const schema = opts.schema ?? progressV1
  if (raw === null) return { kind: 'empty' }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { kind: 'corrupt', reason: 'The saved data is not valid JSON.' }
  }
  const envelope = isObject(parsed) ? parsed : undefined
  const state = isObject(envelope?.state) ? envelope.state : undefined
  let data = isObject(state?.progress) ? state.progress : undefined
  if (!data) return { kind: 'corrupt', reason: 'The saved data has no progress record in it.' }

  const stored = typeof data.schemaVersion === 'number' ? data.schemaVersion : envelope?.version
  if (typeof stored !== 'number' || !Number.isInteger(stored) || stored < 1)
    return { kind: 'corrupt', reason: 'The saved data has no version number.' }
  if (stored > current)
    return {
      kind: 'corrupt',
      reason: `The saved data is from a newer version of the app (version ${String(stored)}).`,
    }
  for (let v = stored; v < current; v++) {
    const step = migrations[v]
    if (!step)
      return {
        kind: 'corrupt',
        reason: `There is no way to upgrade saved data from version ${String(v)}.`,
      }
    try {
      data = step(data)
    } catch {
      return {
        kind: 'corrupt',
        reason: `Upgrading the saved data from version ${String(v)} failed.`,
      }
    }
  }

  const whole = schema.safeParse(data)
  if (whole.success)
    return {
      kind: 'ok',
      progress: whole.data,
      ...(stored < current ? { migratedFrom: stored } : {}),
    }
  // Only the current schema can be repaired field by field.
  if (schema !== progressV1)
    return { kind: 'corrupt', reason: 'The saved data does not match the expected shape.' }
  return repair(data, now)
}

type Section = 'lessons' | 'checks' | 'challenges' | 'scenarios'
const RECORD_SECTIONS: readonly Section[] = ['lessons', 'checks', 'challenges', 'scenarios']

/**
 * Keeps every part of a damaged record that validates on its own: the timestamps, display name, threshold
 * and settings (field by field), and each lesson, check, challenge and scenario entry.
 */
function repair(data: Record<string, unknown>, now: string): LoadResult {
  const shape = progressV1.shape
  const fresh = emptyProgress(now)
  const dropped: string[] = []
  let kept = 0
  const take = <K extends keyof Progress>(
    key: K,
    schema: z.ZodType<Progress[K]>,
  ): Progress[K] | undefined => {
    if (!(key in data)) return undefined
    const r = schema.safeParse(data[key])
    if (r.success) {
      kept++
      return r.data
    }
    dropped.push(key)
    return undefined
  }
  const out: Progress = { ...fresh }
  out.createdAt = take('createdAt', shape.createdAt) ?? fresh.createdAt
  out.updatedAt = now
  const name = take('displayName', shape.displayName)
  if (name !== undefined) out.displayName = name
  else Reflect.deleteProperty(out, 'displayName')

  // Threshold and settings: keep what validates, field by field.
  for (const key of ['threshold', 'settings'] as const) {
    const value = data[key]
    if (value === undefined) continue
    const whole = shape[key].safeParse(value)
    if (whole.success) {
      kept++
      ;(out as Record<string, unknown>)[key] = whole.data
      continue
    }
    const inner = shape[key].unwrap()
    const fields: Record<string, unknown> = {}
    for (const [field, fieldSchema] of Object.entries(inner.shape as Record<string, z.ZodType>)) {
      const v = isObject(value) ? value[field] : undefined
      if (v === undefined) continue
      const r = fieldSchema.safeParse(v)
      if (r.success) {
        fields[field] = r.data
        kept++
      } else dropped.push(`${key}.${field}`)
    }
    if (!isObject(value)) dropped.push(key)
    ;(out as Record<string, unknown>)[key] = shape[key].parse(fields)
  }

  for (const section of RECORD_SECTIONS) {
    const value = data[section]
    if (value === undefined) continue
    if (!isObject(value)) {
      dropped.push(section)
      continue
    }
    const entry = shape[section].unwrap().valueType
    const keyType = shape[section].unwrap().keyType
    const entries: Record<string, unknown> = {}
    for (const [id, v] of Object.entries(value)) {
      const r = entry.safeParse(v)
      if (r.success && keyType.safeParse(id).success) {
        entries[id] = r.data
        kept++
      } else dropped.push(`${section}.${id}`)
    }
    ;(out as Record<string, unknown>)[section] = entries
  }

  if (kept === 0) return { kind: 'corrupt', reason: 'None of the saved progress could be read.' }
  const final = progressV1.safeParse(out)
  return final.success
    ? { kind: 'repaired', progress: final.data, dropped }
    : { kind: 'corrupt', reason: 'The saved data could not be repaired.' }
}
