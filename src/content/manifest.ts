import type { CourseOutline } from '../progress/selectors.ts'
import type { LessonEntry, Manifest, ModuleEntry, RegionEntry } from './schema.ts'

/** Runtime helpers over a built manifest. */

export function allLessons(m: Manifest): LessonEntry[] {
  return m.regions.flatMap((r) => r.modules.flatMap((mod) => mod.lessons))
}

export function findLesson(m: Manifest, id: string): LessonEntry | undefined {
  return allLessons(m).find((l) => l.id === id)
}

export function findRegion(m: Manifest, id: string): RegionEntry | undefined {
  return m.regions.find((r) => r.id === id)
}

export function findModule(
  m: Manifest,
  regionId: string,
  moduleId: string,
): ModuleEntry | undefined {
  return findRegion(m, regionId)?.modules.find((mod) => mod.id === moduleId)
}

/** The outline the progress selectors (E3-01) work over. */
export function courseOutline(m: Manifest): CourseOutline {
  return {
    regions: m.regions.map((r) => ({
      id: r.id,
      modules: r.modules.map((mod) => ({
        id: mod.id,
        lessons: mod.lessons.map((l) => ({ id: l.id, steps: l.steps.map((s) => s.id) })),
      })),
    })),
  }
}
