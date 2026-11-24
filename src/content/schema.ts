import { z } from 'zod'
import { LEVELS } from '../progress/schema.ts'

/**
 * Content schemas (E5-01). Authors write YAML and MDX front matter in these shapes; the build validates
 * them, resolves references and emits the manifest typed by `Manifest` below.
 */

export const slug = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'must be a kebab-case ID like "first-look"')

/** The five placement domains (E4-01). */
export const DOMAINS = [
  'foundations',
  'containers',
  'kubernetes',
  'delivery',
  'observability',
] as const
export const domain = z.enum(DOMAINS)
export const level = z.enum(LEVELS)
export const MOODS = ['console', 'reach', 'stormwatch'] as const

const order = z.number().int().nonnegative()

/** `content/regions/<id>/region.yaml` */
export const regionFile = z.strictObject({
  id: slug,
  title: z.string().min(1),
  order,
  summary: z.string().min(1),
  mood: z.enum(MOODS).default('reach'),
})

/** `content/regions/<region>/<id>/module.yaml` */
export const moduleFile = z.strictObject({
  id: slug,
  title: z.string().min(1),
  order,
  summary: z.string().min(1),
  domain,
})

/** Front matter of `content/regions/<region>/<module>/<id>.mdx` */
export const lessonFrontMatter = z.strictObject({
  id: slug,
  title: z.string().min(1),
  order,
  objectives: z.array(z.string().min(1)).min(1, 'a lesson needs at least one objective'),
  estimatedMinutes: z.number().int().min(1).max(120),
  domain,
  level,
  /** Lesson IDs that should be completed first. */
  prerequisites: z.array(slug).default([]),
  /** Scenario the lesson's terminal runs against (`src/scenarios/<id>.yaml`). */
  scenario: slug.optional(),
  /** Glossary terms the lesson introduces (in addition to any `<Term id>` in the body). */
  terms: z.array(slug).default([]),
})

/** `content/glossary.yaml` (entries filled in by E2-05) */
export const glossaryFile = z.strictObject({
  terms: z
    .array(
      z.strictObject({
        id: slug,
        term: z.string().min(1),
        aliases: z.array(z.string().min(1)).default([]),
        eli5: z.string().min(1),
        operator: z.string().min(1),
        related: z.array(slug).default([]),
        /** Lesson that first introduces the term. */
        introducedIn: slug.optional(),
      }),
    )
    .default([]),
})

export type RegionFile = z.output<typeof regionFile>
export type ModuleFile = z.output<typeof moduleFile>
export type LessonFrontMatter = z.output<typeof lessonFrontMatter>
export type GlossaryEntry = z.output<typeof glossaryFile>['terms'][number]
export type Domain = (typeof DOMAINS)[number]

export interface StepEntry {
  id: string
  title?: string
}

export interface LessonEntry extends Omit<LessonFrontMatter, 'order'> {
  regionId: string
  moduleId: string
  /** Step IDs from `<Step id>` in the body, in order. */
  steps: StepEntry[]
  /** Every glossary term the lesson uses: front matter plus `<Term id>` in the body. */
  terms: string[]
  /** Path of the MDX file, relative to the content root. */
  file: string
}

export interface ModuleEntry extends Omit<ModuleFile, 'order'> {
  regionId: string
  /** Sum of the module's lesson estimates. */
  estimatedMinutes: number
  lessons: LessonEntry[]
}

export interface RegionEntry extends Omit<RegionFile, 'order'> {
  /** Sum of the region's module estimates. */
  estimatedMinutes: number
  modules: ModuleEntry[]
}

/** The built content manifest: regions in journey order, then modules, then lessons. */
export interface Manifest {
  regions: RegionEntry[]
  glossary: GlossaryEntry[]
}
