import { z } from 'zod'

/**
 * Knowledge checks (E5-03): defined in `<lesson>.checks.yaml` beside the lesson and placed with
 * `<Check id>`. Five types; each gives feedback on every try, never limits retries, and shows its
 * explanation once passed. Grading is pure, so every type is unit-tested here.
 */
const slug = z.string().regex(/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/, 'a lowercase slug')
const option = z.strictObject({
  id: slug,
  text: z.string().min(1),
  correct: z.boolean().default(false),
  /** Shown when this option is chosen. */
  feedback: z.string().min(1).optional(),
})
const base = {
  id: slug,
  prompt: z.string().min(1),
  /** Shown once the check is passed. */
  explanation: z.string().min(1),
  /** Must be passed before the lesson counts as complete (E5-04). */
  required: z.boolean().default(false),
}

export const checkSchema = z.discriminatedUnion('type', [
  z.strictObject({
    ...base,
    type: z.literal('single'),
    options: z
      .array(option)
      .min(2)
      .refine((o) => o.filter((x) => x.correct).length === 1, 'exactly one option is correct'),
  }),
  z.strictObject({
    ...base,
    type: z.literal('multiple'),
    options: z
      .array(option)
      .min(2)
      .refine((o) => o.some((x) => x.correct), 'at least one option is correct'),
  }),
  z.strictObject({
    ...base,
    type: z.literal('ordering'),
    /** In the correct order; shown shuffled. */
    items: z.array(z.strictObject({ id: slug, text: z.string().min(1) })).min(2),
  }),
  z.strictObject({
    ...base,
    type: z.literal('matching'),
    /** Each left with its right; the rights are shown shuffled. */
    pairs: z
      .array(z.strictObject({ id: slug, left: z.string().min(1), right: z.string().min(1) }))
      .min(2),
  }),
  z.strictObject({
    ...base,
    type: z.literal('spot-the-bug'),
    /** The snippet, e.g. YAML; each line is a choice. */
    code: z.string().min(1),
    language: z.string().default('yaml'),
    /** 1-based line(s) where the bug is; any of them counts. */
    bugLines: z.array(z.number().int().positive()).min(1),
    /** Feedback for particular wrong lines (by line number). */
    lineFeedback: z.record(z.string().regex(/^\d+$/), z.string().min(1)).default({}),
  }),
])

export const checksFile = z.strictObject({ checks: z.array(checkSchema).default([]) })

export type Check = z.output<typeof checkSchema>
export type CheckInput = z.input<typeof checkSchema>

export interface Grade {
  passed: boolean
  /** What to tell the learner, in order. */
  feedback: string[]
}

const sameSet = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((x) => b.includes(x))

/** Grades an answer: an option ID, a list of IDs, an order, `left=right` pairs, or a line number. */
export function grade(check: Check, answer: string | readonly string[]): Grade {
  const list = typeof answer === 'string' ? [answer] : [...answer]
  switch (check.type) {
    case 'single': {
      const chosen = check.options.find((o) => o.id === list[0])
      if (!chosen) return { passed: false, feedback: ['Choose one of the options.'] }
      return {
        passed: chosen.correct,
        feedback: [
          chosen.feedback ??
            (chosen.correct ? 'That’s right.' : 'Not that one. Have another look.'),
        ],
      }
    }
    case 'multiple': {
      const right = check.options.filter((o) => o.correct).map((o) => o.id)
      const picked = check.options.filter((o) => list.includes(o.id))
      if (!picked.length) return { passed: false, feedback: ['Choose every option that applies.'] }
      const passed = sameSet(
        right,
        picked.map((o) => o.id),
      )
      const missed = right.filter((id) => !list.includes(id)).length
      return {
        passed,
        feedback: [
          ...picked
            .filter((o) => o.feedback && (!passed || o.correct))
            .map((o) => o.feedback ?? ''),
          ...(passed ? (picked.some((o) => o.feedback) ? [] : ['That’s all of them.']) : []),
          ...(!passed && missed
            ? [`${String(missed)} more ${missed === 1 ? 'option applies' : 'options apply'}.`]
            : []),
          ...(!passed &&
          picked.some((o) => !o.correct) &&
          !picked.some((o) => !o.correct && o.feedback)
            ? ['At least one of your choices doesn’t apply.']
            : []),
        ],
      }
    }
    case 'ordering': {
      const want = check.items.map((i) => i.id)
      if (!sameSet(want, list))
        return { passed: false, feedback: ['Put every step in the list in order.'] }
      const inPlace = want.filter((id, i) => list[i] === id).length
      const passed = inPlace === want.length
      return {
        passed,
        feedback: [
          passed
            ? 'That’s the right order.'
            : `${String(inPlace)} of ${String(want.length)} are in the right place.`,
        ],
      }
    }
    case 'matching': {
      const given = new Map(list.map((p) => p.split('=') as [string, string]))
      const right = check.pairs.filter((p) => given.get(p.id) === p.id).length
      const answered = check.pairs.filter((p) => given.has(p.id)).length
      if (answered < check.pairs.length) return { passed: false, feedback: ['Match every item.'] }
      const passed = right === check.pairs.length
      return {
        passed,
        feedback: [
          passed
            ? 'All matched.'
            : `${String(right)} of ${String(check.pairs.length)} matches are right.`,
        ],
      }
    }
    case 'spot-the-bug': {
      const line = Number(list[0])
      const lines = check.code.replace(/\n$/, '').split('\n').length
      if (!Number.isInteger(line) || line < 1 || line > lines)
        return { passed: false, feedback: ['Choose the line with the bug.'] }
      const passed = check.bugLines.includes(line)
      return {
        passed,
        feedback: [
          check.lineFeedback[String(line)] ??
            (passed ? 'That’s the line.' : `Line ${String(line)} is fine. Keep looking.`),
        ],
      }
    }
  }
}

/**
 * A stable shuffle for showing items in a different order from the answer (same check, same order every
 * time, so the page doesn't jump between visits). Never returns the original order for 2+ items.
 */
export function stableShuffle<T>(seed: string, items: readonly T[]): T[] {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619) >>> 0
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0
    const j = h % (i + 1)
    ;[out[i], out[j]] = [out[j] as T, out[i] as T]
  }
  if (out.length > 1 && out.every((x, i) => x === items[i])) out.push(out.shift() as T)
  return out
}

/**
 * A module's test-out (E4-05): `test-out.yaml` beside `module.yaml`, 3–5 checks, each saying which lesson
 * step teaches it, so a learner who misses it is sent there. Passing (80%) marks the module tested out.
 */
export const TEST_OUT_PASS = 0.8
const review = z.strictObject({ lesson: slug, step: slug })
/** A check plus where it's taught. (`review` is taken off before the strict check schema sees the rest.) */
const testOutItem = z.looseObject({ review }).transform((v, ctx) => {
  const { review: where, ...rest } = v
  const r = checkSchema.safeParse(rest)
  if (!r.success) {
    for (const issue of r.error.issues) ctx.addIssue({ ...issue, path: issue.path })
    return z.NEVER
  }
  return { ...r.data, review: where }
})
export const testOutFile = z.strictObject({
  checks: z
    .array(testOutItem)
    .min(3, 'a test-out has 3 to 5 questions')
    .max(5, 'a test-out has 3 to 5 questions'),
})
export type TestOutCheck = z.output<typeof testOutFile>['checks'][number]

/** Grades a whole test-out: the share right, whether it passes, and the items to review. */
export function gradeTestOut(
  checks: readonly TestOutCheck[],
  answers: Readonly<Record<string, string | readonly string[]>>,
) {
  const results = checks.map((c) => ({ check: c, ...grade(c, answers[c.id] ?? []) }))
  const right = results.filter((r) => r.passed).length
  return {
    right,
    total: checks.length,
    passed: right / Math.max(1, checks.length) >= TEST_OUT_PASS,
    review: results.filter((r) => !r.passed).map((r) => r.check),
  }
}

/**
 * A single- or multiple-choice check's options in the order learners see them (#145): a stable shuffle per
 * check, so the correct answer isn't always where the author happened to write it.
 */
export function displayOptions<O>(check: { id: string; options: readonly O[] }): O[] {
  return stableShuffle(`${check.id}/options`, check.options)
}
