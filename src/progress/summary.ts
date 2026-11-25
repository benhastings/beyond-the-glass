import type { Level, Progress } from './schema.ts'
import { challengesCompleted, completedRegions, levelFor, type CourseOutline } from './selectors.ts'

/** What an import preview (E3-03) and the lead view (E3-05) show about a record. */
export interface ProgressSummary {
  displayName: string | undefined
  /** Per-domain level, overrides applied. Empty until the Threshold is done. */
  placement: Record<string, Level>
  lessonsCompleted: number
  /** Modules tested out of (E4-05), counted apart from completed lessons. */
  modulesTestedOut: number
  lessonsStarted: number
  challengesCompleted: number
  /** Region IDs complete, in journey order (needs the course outline). */
  regionsCompleted: string[]
  thresholdComplete: boolean
  lastActivity: string
}

export function summarize(p: Progress, outline?: CourseOutline): ProgressSummary {
  const domains = new Set([
    ...Object.keys(p.threshold.placement ?? {}),
    ...Object.keys(p.threshold.overrides),
  ])
  const placement: Record<string, Level> = {}
  for (const d of [...domains].sort()) {
    const l = levelFor(p, d)
    if (l) placement[d] = l
  }
  const lessons = Object.values(p.lessons)
  return {
    displayName: p.displayName,
    placement,
    lessonsCompleted: lessons.filter((l) => l.completedAt).length,
    modulesTestedOut: Object.keys(p.testedOut ?? {}).length,
    lessonsStarted: lessons.filter((l) => !l.completedAt).length,
    challengesCompleted: challengesCompleted(p),
    regionsCompleted: outline ? completedRegions(p, outline) : [],
    thresholdComplete: p.threshold.completedAt !== undefined,
    lastActivity: p.updatedAt,
  }
}
