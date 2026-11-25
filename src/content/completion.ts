import type { LessonEntry } from './schema.ts'

/** What a lesson's completion depends on (E5-04): its required checks and challenges. */
export interface CompletionState {
  passedChecks: ReadonlySet<string>
  completedChallenges: ReadonlySet<string>
}

export interface Completion {
  complete: boolean
  /** Required items still to do, with the step each is in (when known). */
  missing: { kind: 'check' | 'challenge'; id: string }[]
}

/**
 * A lesson can be completed once every `required` check is passed and every `required` challenge is
 * complete. Non-required ones never hold it up, and neither does skipping steps.
 */
export function lessonCompletion(
  lesson: Pick<LessonEntry, 'checks' | 'challenges'>,
  s: CompletionState,
): Completion {
  const missing = [
    ...lesson.checks
      .filter((c) => c.required && !s.passedChecks.has(c.id))
      .map((c) => ({ kind: 'check' as const, id: c.id })),
    ...lesson.challenges
      .filter((c) => c.required && !s.completedChallenges.has(c.id))
      .map((c) => ({ kind: 'challenge' as const, id: c.id })),
  ]
  return { complete: missing.length === 0, missing }
}
