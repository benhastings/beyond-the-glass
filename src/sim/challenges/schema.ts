import { z } from 'zod'

const slug = z
  .string()
  .regex(/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/, 'a lowercase slug like find-the-pod')
const regex = z.string().refine((r) => {
  try {
    new RegExp(r)
    return true
  } catch {
    return false
  }
}, 'a valid regular expression')

/** Which objects a predicate looks at. */
const resourceRef = z.strictObject({
  kind: z.enum([
    'Pod',
    'Deployment',
    'ReplicaSet',
    'Service',
    'ConfigMap',
    'Secret',
    'Node',
    'Namespace',
  ]),
  namespace: slug.optional(),
  name: z.string().optional(),
  /** Name prefix, e.g. a Deployment's pods: `ravenpost-notifier-`. */
  namePrefix: z.string().optional(),
  labels: z.record(z.string(), z.string()).optional(),
  /** Only objects where `path` has this value (as text), e.g. `status.phase` / `Running`. */
  where: z.strictObject({ path: z.string(), equals: z.string() }).optional(),
})

/** How a learner's typed answer is judged. */
const matcher = z.union([
  z.strictObject({ equals: z.string(), caseSensitive: z.boolean().default(false) }),
  z.strictObject({ matches: regex }),
  /** The name of one of these objects; a prefix that names exactly one of them also counts. */
  z.strictObject({ resource: resourceRef, allowPrefix: z.boolean().default(true) }),
])

export interface PredicateInput {
  type: string
}
const base = {
  ranCommand: z.strictObject({ type: z.literal('ranCommand'), pattern: regex }),
  resourceState: z.strictObject({
    type: z.literal('resourceState'),
    resource: resourceRef,
    path: z.string(),
    /** The value at `path`, as text (`"3"`, `"True"`, `"Running"`). */
    equals: z.string().optional(),
    matches: regex.optional(),
    /** `all` (default): every selected object must match, and there must be at least one; `any`; `none`. */
    quantifier: z.enum(['all', 'any', 'none']).default('all'),
  }),
  answered: z.strictObject({ type: z.literal('answered'), question: slug, matcher }),
  noForbidden: z.strictObject({ type: z.literal('noForbidden'), pattern: regex }),
  /**
   * How an object was changed (E7-03): `mr` when Argo CD synced it from a revision that includes one of the
   * learner's merged merge requests, `kubectl` when the learner changed it directly. `only` also requires
   * that the other way wasn't used.
   */
  changedVia: z.strictObject({
    type: z.literal('changedVia'),
    via: z.enum(['mr', 'kubectl']),
    kind: z.string(),
    name: z.string(),
    only: z.boolean().default(false),
  }),
  mutated: z.strictObject({
    type: z.literal('mutated'),
    verb: z.string(),
    kind: z.string().optional(),
    name: z.string().optional(),
  }),
}

export type Predicate =
  | z.output<(typeof base)[keyof typeof base]>
  | { type: 'all'; of: Predicate[] }
  | { type: 'any'; of: Predicate[] }

export const predicateSchema: z.ZodType<Predicate> = z.lazy(
  (): z.ZodType<Predicate> =>
    z.discriminatedUnion('type', [
      ...Object.values(base),
      z.strictObject({ type: z.literal('all'), of: z.array(predicateSchema).min(1) }),
      z.strictObject({ type: z.literal('any'), of: z.array(predicateSchema).min(1) }),
    ] as unknown as [z.ZodObject, ...z.ZodObject[]]) as unknown as z.ZodType<Predicate>,
)

export const HINT_LEVELS = ['nudge', 'pointer', 'command'] as const

export const challengeSchema = z.strictObject({
  id: slug,
  title: z.string().min(1),
  scenario: slug,
  /** What the learner is asked to do, shown above the checklist. */
  brief: z.string().min(1),
  questions: z.array(z.strictObject({ id: slug, prompt: z.string().min(1) })).default([]),
  objectives: z
    .array(z.strictObject({ id: slug, text: z.string().min(1), check: predicateSchema }))
    .min(1),
  /** Commands that would do harm here; running one is flagged (never blocks completion). */
  forbidden: z.array(z.strictObject({ pattern: regex, message: z.string().min(1) })).default([]),
  /** The hint ladder, in order: nudge, then pointer, then the exact command. */
  hints: z
    .array(z.strictObject({ level: z.enum(HINT_LEVELS), text: z.string().min(1) }))
    .min(1)
    .refine(
      (hs) =>
        hs.every(
          (h, i) =>
            i === 0 ||
            HINT_LEVELS.indexOf(h.level) >= HINT_LEVELS.indexOf(hs[i - 1]?.level ?? 'nudge'),
        ),
      'hints go from nudge to pointer to command',
    ),
  /** A solution, run in CI to prove the challenge can be completed (E6-10.AC4). */
  expertPath: z.array(z.string().min(1)).min(1),
})

export type Challenge = z.output<typeof challengeSchema>
export type ChallengeInput = z.input<typeof challengeSchema>
