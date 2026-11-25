import {
  progressV1,
  type Answer,
  type ChallengeProgress,
  type Depth,
  type Level,
  type Progress,
  type ScenarioProgress,
  type Settings,
} from './schema.ts'

/**
 * Pure state transitions. Each returns a new record with `updatedAt` set to `now`; none mutates its input.
 * The app's store wraps them and supplies the time (src/progress stays framework-free and clock-free).
 */

const touch = (p: Progress, now: string): Progress => ({ ...p, updatedAt: now })

/** A copy of `obj` without `key`. */
function omit<T extends object, K extends keyof T>(obj: T, key: K): Omit<T, K> {
  const copy = { ...obj }
  Reflect.deleteProperty(copy, key)
  return copy
}

/** Remembers where the learner is (a lesson route with its step), for the "Continue" link (E3-04). */
export function setResumeAt(p: Progress, path: string, now: string): Progress {
  if (p.resumeAt?.path === path) return p
  return touch({ ...p, resumeAt: { path, at: now } }, now)
}

/** Marks a module tested out (E4-05): it counts toward completion, shown apart from completed ones. */
export function testOutModule(p: Progress, moduleKey: string, now: string): Progress {
  if (p.testedOut?.[moduleKey]) return p
  return touch({ ...p, testedOut: { ...p.testedOut, [moduleKey]: now } }, now)
}

/**
 * Retaking the Threshold (E4-05) clears its answers, placement, overrides and chosen start, so it can
 * recompute recommendations. Lessons, checks, challenges and scenarios are never touched.
 */
export function retakeThreshold(p: Progress, now: string): Progress {
  return touch({ ...p, threshold: { answers: {}, overrides: {} } }, now)
}

export function setDisplayName(p: Progress, name: string | undefined, now: string): Progress {
  const trimmed = name?.trim()
  const rest = omit(p, 'displayName')
  return touch(
    trimmed ? { ...rest, displayName: progressV1.shape.displayName.parse(trimmed) } : rest,
    now,
  )
}

export function recordThresholdAnswer(
  p: Progress,
  questionId: string,
  value: Answer,
  now: string,
): Progress {
  return touch(
    {
      ...p,
      threshold: { ...p.threshold, answers: { ...p.threshold.answers, [questionId]: value } },
    },
    now,
  )
}

export function completeThreshold(
  p: Progress,
  placement: Record<string, Level>,
  now: string,
): Progress {
  return touch(
    { ...p, threshold: { ...p.threshold, placement: { ...placement }, completedAt: now } },
    now,
  )
}

export function overrideLevel(
  p: Progress,
  domain: string,
  value: Level | undefined,
  now: string,
): Progress {
  const overrides = Object.fromEntries(
    Object.entries(p.threshold.overrides).filter(([d]) => d !== domain),
  )
  if (value) overrides[domain] = value
  return touch({ ...p, threshold: { ...p.threshold, overrides } }, now)
}

export function chooseStartRegion(p: Progress, region: string | undefined, now: string): Progress {
  const threshold = omit(p.threshold, 'startRegion')
  return touch({ ...p, threshold: region ? { ...threshold, startRegion: region } : threshold }, now)
}

const lessonOf = (p: Progress, id: string) =>
  p.lessons[id] ?? { currentStep: 0, completedSteps: [] }

export function goToStep(p: Progress, lessonId: string, step: number, now: string): Progress {
  return touch(
    {
      ...p,
      lessons: {
        ...p.lessons,
        [lessonId]: { ...lessonOf(p, lessonId), currentStep: Math.max(0, step) },
      },
    },
    now,
  )
}

export function completeStep(p: Progress, lessonId: string, stepId: string, now: string): Progress {
  const l = lessonOf(p, lessonId)
  if (l.completedSteps.includes(stepId)) return p
  return touch(
    {
      ...p,
      lessons: {
        ...p.lessons,
        [lessonId]: { ...l, completedSteps: [...l.completedSteps, stepId] },
      },
    },
    now,
  )
}

export function completeLesson(p: Progress, lessonId: string, now: string): Progress {
  const l = lessonOf(p, lessonId)
  if (l.completedAt) return p
  return touch({ ...p, lessons: { ...p.lessons, [lessonId]: { ...l, completedAt: now } } }, now)
}

export function setDepth(p: Progress, lessonId: string, value: Depth, now: string): Progress {
  return touch(
    { ...p, lessons: { ...p.lessons, [lessonId]: { ...lessonOf(p, lessonId), depth: value } } },
    now,
  )
}

export function recordCheckAttempt(
  p: Progress,
  checkId: string,
  value: Answer,
  passed: boolean,
  now: string,
): Progress {
  const c = p.checks[checkId] ?? { attempts: 0, passed: false }
  return touch(
    {
      ...p,
      checks: {
        ...p.checks,
        [checkId]: { attempts: c.attempts + 1, passed: c.passed || passed, lastAnswer: value },
      },
    },
    now,
  )
}

export function updateChallenge(
  p: Progress,
  challengeId: string,
  patch: Partial<Omit<ChallengeProgress, 'completedAt'>>,
  now: string,
): Progress {
  const c = p.challenges[challengeId] ?? { status: 'not-started', hintsUsed: 0, commandsRun: 0 }
  const next: ChallengeProgress = {
    ...c,
    ...patch,
    // A completed challenge stays completed; hints only ever go up.
    status: c.status === 'completed' ? 'completed' : (patch.status ?? c.status),
    hintsUsed: Math.max(c.hintsUsed, patch.hintsUsed ?? 0),
  }
  if (next.status === 'completed' && !c.completedAt) next.completedAt = now
  return touch({ ...p, challenges: { ...p.challenges, [challengeId]: next } }, now)
}

export function saveScenario(
  p: Progress,
  scenarioId: string,
  patch: ScenarioProgress,
  now: string,
): Progress {
  return touch(
    { ...p, scenarios: { ...p.scenarios, [scenarioId]: { ...p.scenarios[scenarioId], ...patch } } },
    now,
  )
}

export function updateSettings(
  p: Progress,
  patch: Partial<Omit<Settings, 'updatedAt'>>,
  now: string,
): Progress {
  return touch({ ...p, settings: { ...p.settings, ...patch, updatedAt: now } }, now)
}
