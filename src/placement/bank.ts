import { z } from 'zod'

/**
 * The Threshold's question bank (E4-01): `content/threshold/bank.yaml`, validated at build time. The model
 * (domains, serving, scoring, module statuses) is in docs/design/placement.md; the engine is E4-03.
 */
export const PLACEMENT_DOMAINS = [
  'foundations',
  'containers',
  'kubernetes',
  'delivery',
  'observability',
] as const
export type PlacementDomain = (typeof PLACEMENT_DOMAINS)[number]
/** Domain levels 0–3, by name. */
export const LEVEL_NAMES = ['wayfarer', 'deckhand', 'navigator', 'pathfinder'] as const
export const NOT_SURE = 'not-sure'

const slug = z.string().regex(/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/, 'a lowercase slug')
const sentence = z.string().min(1).max(300)

const experience = z.strictObject({
  id: slug,
  kind: z.literal('experience'),
  domain: z.enum(PLACEMENT_DOMAINS),
  difficulty: z.number().int().min(1).max(3),
  stem: sentence,
  /** Exactly four, from "never" (level 0) to "weekly" (level 3). */
  options: z
    .array(z.strictObject({ id: slug, text: sentence, level: z.number().int().min(0).max(3) }))
    .length(4)
    .refine(
      (o) => o.map((x) => x.level).join() === '0,1,2,3',
      'options go from level 0 to level 3, in order',
    ),
  why: sentence,
})

const scenario = z
  .strictObject({
    id: slug,
    kind: z.literal('scenario'),
    domain: z.enum(PLACEMENT_DOMAINS),
    difficulty: z.number().int().min(1).max(3),
    stem: sentence,
    options: z
      .array(z.strictObject({ id: slug, text: sentence }))
      .min(3)
      .max(6),
    correct: slug,
    /** One sentence shown in the results, explaining the answer. */
    why: sentence,
  })
  .superRefine((s, ctx) => {
    if (!s.options.some((o) => o.id === s.correct))
      ctx.addIssue({
        code: 'custom',
        path: ['correct'],
        message: `"${s.correct}" is not one of the options`,
      })
    const last = s.options.at(-1)
    if (last?.id !== NOT_SURE || last.text !== 'I’m not sure yet')
      ctx.addIssue({
        code: 'custom',
        path: ['options'],
        message: `the last option must be { id: ${NOT_SURE}, text: I’m not sure yet }`,
      })
    if (s.correct === NOT_SURE)
      ctx.addIssue({ code: 'custom', path: ['correct'], message: '“not sure” can’t be correct' })
  })

export const itemSchema = z.discriminatedUnion('kind', [experience, scenario])

export const bankSchema = z
  .strictObject({
    version: z.literal(1),
    /** Shown before the first question. */
    intro: z.strictObject({
      title: z.string().min(1),
      body: sentence,
      time: sentence,
      privacy: sentence,
    }),
    serving: z.strictObject({
      /** Questions served in all. */
      total: z.number().int().positive(),
      /** Per domain: one experience item, then this many scenario items (min–max). */
      scenariosPerDomain: z.strictObject({
        min: z.number().int().min(1),
        max: z.number().int().min(1),
      }),
    }),
    items: z.array(itemSchema).min(25),
  })
  .superRefine((b, ctx) => {
    const ids = new Set<string>()
    b.items.forEach((it, i) => {
      if (ids.has(it.id))
        ctx.addIssue({
          code: 'custom',
          path: ['items', i, 'id'],
          message: `duplicate item "${it.id}"`,
        })
      ids.add(it.id)
    })
    for (const d of PLACEMENT_DOMAINS) {
      const items = b.items.filter((it) => it.domain === d)
      if (items.length < 5)
        ctx.addIssue({
          code: 'custom',
          path: ['items'],
          message: `${d} needs at least 5 items (has ${String(items.length)})`,
        })
      if (!items.some((it) => it.kind === 'experience'))
        ctx.addIssue({ code: 'custom', path: ['items'], message: `${d} needs an experience item` })
      const scenarios = items.filter((it) => it.kind === 'scenario')
      if (scenarios.length < b.serving.scenariosPerDomain.max)
        ctx.addIssue({
          code: 'custom',
          path: ['items'],
          message: `${d} needs at least ${String(b.serving.scenariosPerDomain.max)} scenario items`,
        })
      if (!scenarios.some((s) => s.difficulty === 1))
        ctx.addIssue({
          code: 'custom',
          path: ['items'],
          message: `${d} needs an easiest (difficulty 1) scenario for the adaptive skip`,
        })
    }
    const { min, max } = b.serving.scenariosPerDomain
    if (min > max)
      ctx.addIssue({ code: 'custom', path: ['serving'], message: 'min is more than max' })
    const n = PLACEMENT_DOMAINS.length
    if (b.serving.total < n * (1 + min) || b.serving.total > n * (1 + max))
      ctx.addIssue({
        code: 'custom',
        path: ['serving', 'total'],
        message: `total must be between ${String(n * (1 + min))} and ${String(n * (1 + max))}`,
      })
  })

export type Bank = z.output<typeof bankSchema>
export type BankItem = Bank['items'][number]
