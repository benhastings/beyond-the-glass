import type { Manifest } from '../content/schema.ts'
import type { Progress } from '../progress/schema.ts'
import { LEVEL_NAMES, PLACEMENT_DOMAINS, type PlacementDomain } from './bank.ts'
import { buildPath, type Level, type PathPlan } from './engine.ts'

/**
 * Where the learner is on the journey (E2-03): a status for every region and module, from the content,
 * their progress and their placement. Regions are never locked; "recommended next" is a suggestion.
 */
export type JourneyStatus = 'recommended' | 'in-progress' | 'complete' | 'optional' | 'not-started'

export const STATUS_LABELS: Readonly<Record<JourneyStatus, string>> = {
  recommended: 'recommended next',
  'in-progress': 'in progress',
  complete: 'complete',
  optional: 'optional (tested out)',
  'not-started': 'not started',
}

export interface ModuleJourney {
  id: string
  title: string
  status: JourneyStatus
  lessons: number
  lessonsDone: number
  /** Why the placement suggests it (or doesn't). */
  reason?: string
}

export interface RegionJourney {
  id: string
  title: string
  summary: string
  status: JourneyStatus
  modules: ModuleJourney[]
  modulesDone: number
  estimatedMinutes: number
}

/** The learner's level per domain: overrides first, then placement, else Wayfarer. */
export function learnerLevels(p: Progress): Record<PlacementDomain, Level> {
  const t = p.threshold
  return Object.fromEntries(
    PLACEMENT_DOMAINS.map((d) => {
      const name = t.overrides[d] ?? t.placement?.[d]
      const i = name ? LEVEL_NAMES.indexOf(name) : 0
      return [d, Math.max(0, i) as Level]
    }),
  ) as Record<PlacementDomain, Level>
}

/** Every region with its status, in journey order. */
export function journey(
  manifest: Manifest,
  p: Progress,
): { regions: RegionJourney[]; plan: PathPlan } {
  const plan = buildPath(learnerLevels(p), manifest)
  const placed = p.threshold.completedAt !== undefined
  const lessonDone = (id: string) => p.lessons[id]?.completedAt !== undefined
  const lessonStarted = (id: string) => {
    const l = p.lessons[id]
    return (
      l !== undefined &&
      (l.completedSteps.length > 0 || l.currentStep > 0 || l.completedAt !== undefined)
    )
  }
  // The first recommended module that isn't finished yet is "recommended next".
  let next: string | undefined
  const regions = manifest.regions.map((r) => {
    const modules: ModuleJourney[] = r.modules.map((m) => {
      const planned = plan.modules.find((x) => x.regionId === r.id && x.moduleId === m.id)
      const done = m.lessons.filter((l) => lessonDone(l.id)).length
      const started = m.lessons.some((l) => lessonStarted(l.id))
      let status: JourneyStatus
      if (m.lessons.length > 0 && done === m.lessons.length) status = 'complete'
      else if (started) status = 'in-progress'
      else if (placed && planned?.status === 'test-out') status = 'optional'
      else status = 'not-started'
      return {
        id: m.id,
        title: m.title,
        status,
        lessons: m.lessons.length,
        lessonsDone: done,
        ...(placed && planned ? { reason: planned.reason } : {}),
      }
    })
    return { region: r, modules }
  })
  // "Recommended next" follows the plan: the first unfinished module the placement recommends, then one to
  // review, then (before the Threshold, or once everything else is done) the first unfinished module.
  const candidates = regions.flatMap(({ region, modules }) =>
    modules
      .filter((m) => m.lessons > 0 && m.status !== 'complete' && m.status !== 'optional')
      .map((m) => ({
        key: `${region.id}/${m.id}`,
        m,
        planned: plan.modules.find((x) => x.regionId === region.id && x.moduleId === m.id),
      })),
  )
  const pick =
    (placed && candidates.find((c) => c.planned?.status === 'recommended')) ||
    (placed && candidates.find((c) => c.planned?.status === 'review')) ||
    candidates[0]
  if (pick) {
    next = pick.key
    if (pick.m.status === 'not-started') pick.m.status = 'recommended'
  }
  return {
    plan,
    regions: regions.map(({ region, modules }) => {
      const modulesDone = modules.filter((m) => m.status === 'complete').length
      let status: JourneyStatus
      if (
        modules.length > 0 &&
        modules.every((m) => m.status === 'complete' || m.status === 'optional') &&
        modulesDone > 0
      )
        status = 'complete'
      else if (modules.some((m) => m.status === 'in-progress' || m.status === 'complete'))
        status = 'in-progress'
      else if (next?.startsWith(`${region.id}/`)) status = 'recommended'
      else if (modules.length > 0 && modules.every((m) => m.status === 'optional'))
        status = 'optional'
      else status = 'not-started'
      return {
        id: region.id,
        title: region.title,
        summary: region.summary,
        status,
        modules,
        modulesDone,
        estimatedMinutes: region.estimatedMinutes,
      }
    }),
  }
}

/** "Helm Keep, in progress, 2 of 5 modules": a region's accessible name, with its status in words. */
export function regionLabel(r: RegionJourney): string {
  const counts = r.modules.length
    ? `, ${String(r.modulesDone)} of ${String(r.modules.length)} modules`
    : ''
  return `${r.title}, ${STATUS_LABELS[r.status]}${counts}`
}
