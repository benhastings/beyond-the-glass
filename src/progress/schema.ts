import { z } from 'zod'

/**
 * The learner's progress, version 1. This schema is the single source of truth: every type below is
 * inferred from it (E3-01.AC1). It is strict, so no field can be added without a schema change, and the
 * only personal field is the optional display name (E3-01.AC4).
 */

export const PROGRESS_KEY = 'btg:progress'

/** A stable content ID: kebab-case segments, optionally `region/module/lesson`. */
export const contentId = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/, 'must be a kebab-case ID')
const timestamp = z.iso.datetime()
const count = z.number().int().nonnegative()

/** Placement levels, shown as a trail rather than a grade (ROADMAP §3). */
export const LEVELS = ['wayfarer', 'deckhand', 'navigator', 'pathfinder'] as const
export const level = z.enum(LEVELS)

export const DEPTHS = ['eli5', 'operator', 'deep'] as const
export const depth = z.enum(DEPTHS)

/** A quiz or check answer: one choice ID, several, or free text. */
const answer = z.union([z.string().max(500), z.array(z.string().max(200)).max(20)])

export const thresholdSchema = z.strictObject({
  answers: z.record(contentId, answer).default({}),
  completedAt: timestamp.optional(),
  /** Per-domain level the placement engine (E4-03) chose. */
  placement: z.record(contentId, level).optional(),
  /** Per-domain levels the learner chose instead. These always win. */
  overrides: z.record(contentId, level).default({}),
  /** Region the learner chose to start in, if they overrode the suggested one. */
  startRegion: contentId.optional(),
})

export const lessonProgressSchema = z.strictObject({
  currentStep: count.default(0),
  completedSteps: z.array(contentId).default([]),
  completedAt: timestamp.optional(),
  depth: depth.optional(),
})

export const checkProgressSchema = z.strictObject({
  attempts: count.default(0),
  passed: z.boolean().default(false),
  lastAnswer: answer.optional(),
})

export const CHALLENGE_STATUSES = ['not-started', 'in-progress', 'completed'] as const
export const challengeProgressSchema = z.strictObject({
  status: z.enum(CHALLENGE_STATUSES).default('not-started'),
  /** How far up the hint ladder the learner went (0 = no hints). Never blocks completion. */
  hintsUsed: count.default(0),
  commandsRun: count.default(0),
  completedAt: timestamp.optional(),
})

export const scenarioProgressSchema = z.strictObject({
  /** A simulator snapshot (E6-01), for resuming mid-scenario. Validated by the simulator on restore. */
  snapshot: z.unknown().optional(),
  act: count.optional(),
  /** The learner's own working notes (capstone war room). */
  notes: z.string().max(4000).optional(),
  /** When the learner finished the scenario (the capstone's badge, E10-05). Kept in progress codes. */
  completedAt: timestamp.optional(),
})

const preference = z.enum(['system', 'on', 'off'])
export const TEXT_SIZES = [100, 115, 130] as const
export const settingsSchema = z.strictObject({
  reduceMotion: preference.default('system'),
  highContrast: preference.default('system'),
  textSize: z.union([z.literal(100), z.literal(115), z.literal(130)]).default(100),
  /** The Crossing (E1-06) has played once; it plays again only when replayed from Settings. */
  crossingSeen: z.boolean().optional(),
  /** The depth layer last chosen in each domain's lessons (E5-05); the placement level decides until then. */
  depthByDomain: z.record(contentId, depth).optional(),
  /** When settings last changed: the later copy wins when progress is merged (E3-03). */
  updatedAt: timestamp.optional(),
})

export const progressV1 = z.strictObject({
  schemaVersion: z.literal(1),
  createdAt: timestamp,
  updatedAt: timestamp,
  displayName: z.string().trim().min(1).max(40).optional(),
  threshold: thresholdSchema.default({ answers: {}, overrides: {} }),
  lessons: z.record(contentId, lessonProgressSchema).default({}),
  checks: z.record(contentId, checkProgressSchema).default({}),
  challenges: z.record(contentId, challengeProgressSchema).default({}),
  scenarios: z.record(contentId, scenarioProgressSchema).default({}),
  /** Modules the learner tested out of (E4-05), by `region/module`, with when. */
  testedOut: z.record(contentId, timestamp).optional(),
  /** Where the learner last was in a lesson (route and step), for "Continue" (E3-04). */
  resumeAt: z.strictObject({ path: z.string().startsWith('/').max(200), at: timestamp }).optional(),
  settings: settingsSchema.default({
    reduceMotion: 'system',
    highContrast: 'system',
    textSize: 100,
  }),
})

export type ProgressV1 = z.infer<typeof progressV1>
export type Progress = ProgressV1
export type Level = z.infer<typeof level>
export type Depth = z.infer<typeof depth>
export type Threshold = z.infer<typeof thresholdSchema>
export type LessonProgress = z.infer<typeof lessonProgressSchema>
export type CheckProgress = z.infer<typeof checkProgressSchema>
export type ChallengeProgress = z.infer<typeof challengeProgressSchema>
export type ScenarioProgress = z.infer<typeof scenarioProgressSchema>
export type Settings = z.infer<typeof settingsSchema>
export type Answer = z.infer<typeof answer>

export const CURRENT_VERSION = 1

/** A fresh, empty progress record created at `now`. */
export function emptyProgress(now: string): Progress {
  return progressV1.parse({ schemaVersion: 1, createdAt: now, updatedAt: now })
}
