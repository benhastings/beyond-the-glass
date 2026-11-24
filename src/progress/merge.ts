import type {
  ChallengeProgress,
  CheckProgress,
  LessonProgress,
  Progress,
  ScenarioProgress,
} from './schema.ts'
import { CHALLENGE_STATUSES } from './schema.ts'

/**
 * Merging an imported record into this browser's (E3-03): for each item, the furthest progress wins.
 * A completed lesson or challenge beats an in-progress one; counts take the larger value; for settings
 * and the placement, the later timestamp wins.
 */

const earliest = (a?: string, b?: string) => (a && b ? (a < b ? a : b) : (a ?? b))
const later = (a?: string, b?: string) => (a ?? '') >= (b ?? '')

function mergeRecord<T>(
  a: Record<string, T>,
  b: Record<string, T>,
  f: (x: T, y: T) => T,
): Record<string, T> {
  const out: Record<string, T> = { ...b, ...a }
  for (const k of Object.keys(a)) if (k in b) out[k] = f(a[k] as T, b[k] as T)
  return out
}

export function mergeLesson(a: LessonProgress, b: LessonProgress): LessonProgress {
  if (a.completedAt && !b.completedAt) return a
  if (b.completedAt && !a.completedAt) return b
  const completedAt = earliest(a.completedAt, b.completedAt)
  const depth = a.depth ?? b.depth
  return {
    currentStep: Math.max(a.currentStep, b.currentStep),
    completedSteps: [...new Set([...a.completedSteps, ...b.completedSteps])],
    ...(completedAt ? { completedAt } : {}),
    ...(depth ? { depth } : {}),
  }
}

export function mergeCheck(a: CheckProgress, b: CheckProgress): CheckProgress {
  const lastAnswer = (a.attempts >= b.attempts ? a : b).lastAnswer ?? a.lastAnswer ?? b.lastAnswer
  return {
    attempts: Math.max(a.attempts, b.attempts),
    passed: a.passed || b.passed,
    ...(lastAnswer !== undefined ? { lastAnswer } : {}),
  }
}

const rank = (s: ChallengeProgress['status']) => CHALLENGE_STATUSES.indexOf(s)

export function mergeChallenge(a: ChallengeProgress, b: ChallengeProgress): ChallengeProgress {
  const status = rank(a.status) >= rank(b.status) ? a.status : b.status
  const completedAt = earliest(a.completedAt, b.completedAt)
  return {
    status,
    hintsUsed: Math.max(a.hintsUsed, b.hintsUsed),
    commandsRun: Math.max(a.commandsRun, b.commandsRun),
    ...(status === 'completed' && completedAt ? { completedAt } : {}),
  }
}

export function mergeScenario(a: ScenarioProgress, b: ScenarioProgress): ScenarioProgress {
  // This browser's snapshot is kept (codes don't carry them); the further act wins.
  const act = Math.max(a.act ?? -1, b.act ?? -1)
  const notes = a.notes || b.notes
  return {
    ...(a.snapshot !== undefined
      ? { snapshot: a.snapshot }
      : b.snapshot !== undefined
        ? { snapshot: b.snapshot }
        : {}),
    ...(act >= 0 ? { act } : {}),
    ...(notes ? { notes } : {}),
  }
}

/** Merges `incoming` into `local`. Neither is changed. */
export function mergeProgress(local: Progress, incoming: Progress, now: string): Progress {
  const thresholdFromIncoming =
    !!incoming.threshold.completedAt &&
    (!local.threshold.completedAt || incoming.threshold.completedAt > local.threshold.completedAt)
  const name = local.displayName ?? incoming.displayName
  const merged: Progress = {
    schemaVersion: 1,
    createdAt: earliest(local.createdAt, incoming.createdAt) ?? local.createdAt,
    updatedAt: now,
    threshold: thresholdFromIncoming ? incoming.threshold : local.threshold,
    lessons: mergeRecord(local.lessons, incoming.lessons, mergeLesson),
    checks: mergeRecord(local.checks, incoming.checks, mergeCheck),
    challenges: mergeRecord(local.challenges, incoming.challenges, mergeChallenge),
    scenarios: mergeRecord(local.scenarios, incoming.scenarios, mergeScenario),
    settings: later(local.settings.updatedAt, incoming.settings.updatedAt)
      ? local.settings
      : incoming.settings,
  }
  if (name) merged.displayName = name
  return merged
}
