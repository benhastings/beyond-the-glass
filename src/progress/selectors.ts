import type { Level, Progress } from './schema.ts'

/**
 * The shape of the course the selectors need: regions in journey order, each with modules of lessons,
 * each lesson with its step IDs. The content manifest (E5-01) provides it.
 */
export interface CourseOutline {
  regions: {
    id: string
    modules: { id: string; lessons: { id: string; steps: string[] }[] }[]
  }[]
}

export type LessonStatus = 'not-started' | 'in-progress' | 'completed'

export function lessonStatus(p: Progress, lessonId: string): LessonStatus {
  const l = p.lessons[lessonId]
  if (!l) return 'not-started'
  if (l.completedAt) return 'completed'
  return l.completedSteps.length > 0 || l.currentStep > 0 ? 'in-progress' : 'not-started'
}

const percent = (done: number, total: number) =>
  total === 0 ? 0 : Math.round((done / total) * 100)

const lessonsOf = (outline: CourseOutline, regionId: string) =>
  outline.regions.find((r) => r.id === regionId)?.modules.flatMap((m) => m.lessons) ?? []

/** Whole-number percentage of the region's lessons that are complete (0 for an unknown or empty region). */
export function regionCompletion(p: Progress, outline: CourseOutline, regionId: string): number {
  const lessons = lessonsOf(outline, regionId)
  return percent(
    lessons.filter((l) => lessonStatus(p, l.id) === 'completed').length,
    lessons.length,
  )
}

export function moduleCompletion(
  p: Progress,
  outline: CourseOutline,
  regionId: string,
  moduleId: string,
): number {
  const lessons =
    outline.regions.find((r) => r.id === regionId)?.modules.find((m) => m.id === moduleId)
      ?.lessons ?? []
  return percent(
    lessons.filter((l) => lessonStatus(p, l.id) === 'completed').length,
    lessons.length,
  )
}

/** Regions whose every lesson is complete, in journey order. */
export function completedRegions(p: Progress, outline: CourseOutline): string[] {
  return outline.regions
    .filter((r) => {
      const lessons = lessonsOf(outline, r.id)
      return lessons.length > 0 && lessons.every((l) => lessonStatus(p, l.id) === 'completed')
    })
    .map((r) => r.id)
}

/** The learner's level for a domain: their own override if they chose one, otherwise the placement. */
export function levelFor(p: Progress, domain: string): Level | undefined {
  return p.threshold.overrides[domain] ?? p.threshold.placement?.[domain]
}

export function thresholdComplete(p: Progress): boolean {
  return p.threshold.completedAt !== undefined
}

export interface NextStep {
  regionId: string
  moduleId: string
  lessonId: string
  /** Index of the step to open. */
  step: number
}

/**
 * Where "Continue" should take the learner: the first lesson in course order that isn't complete,
 * starting at their chosen start region (or the beginning) and wrapping round to anything skipped.
 * An in-progress lesson opens at its current step. Undefined when everything is complete.
 */
export function nextRecommendedStep(p: Progress, outline: CourseOutline): NextStep | undefined {
  const start = Math.max(
    0,
    outline.regions.findIndex((r) => r.id === p.threshold.startRegion),
  )
  const ordered = [...outline.regions.slice(start), ...outline.regions.slice(0, start)]
  for (const r of ordered)
    for (const m of r.modules)
      for (const l of m.lessons) {
        if (lessonStatus(p, l.id) === 'completed') continue
        const current = p.lessons[l.id]?.currentStep ?? 0
        return {
          regionId: r.id,
          moduleId: m.id,
          lessonId: l.id,
          step: Math.min(current, Math.max(0, l.steps.length - 1)),
        }
      }
  return undefined
}

export function challengesCompleted(p: Progress): number {
  return Object.values(p.challenges).filter((c) => c.status === 'completed').length
}

export function totalHintsUsed(p: Progress): number {
  return Object.values(p.challenges).reduce((n, c) => n + c.hintsUsed, 0)
}
