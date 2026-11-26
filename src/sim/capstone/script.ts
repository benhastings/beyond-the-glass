import { z } from 'zod'
import { ChallengeRun } from '../challenges/engine.ts'
import { challengeSchema, predicateSchema, type Predicate } from '../challenges/schema.ts'
import { parseDuration } from '../core/duration.ts'
import type { Scenario } from '../core/scenario.ts'
import type { Simulator } from '../core/simulator.ts'

/**
 * The capstone's script (E10-02): acts, each with the faults that start it (timed from when the act
 * begins, so a learner who takes longer isn't overtaken by the next act), what "fixed" means, the evidence
 * each signal shows, the root cause, and an expert path that solves it.
 */
const slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
const expertStep = z.union([
  z.strictObject({ run: z.string().min(1) }),
  z.strictObject({
    mr: z.strictObject({
      repo: z.string(),
      file: z.string(),
      replace: z.tuple([z.string(), z.string()]),
      message: z.string(),
    }),
  }),
  z.strictObject({ revertMr: z.strictObject({ repo: z.string() }) }),
  z.strictObject({ wait: z.string() }),
])

/** Every signal an act's evidence must be described in (AC2: "its evidence in every signal"). */
export const SIGNALS = ['kubectl', 'events', 'logs', 'metrics', 'traces', 'argo'] as const

export const actSchema = z.strictObject({
  id: slug,
  title: z.string().min(1),
  /** When it happens, on the incident's clock ("21:02"). */
  clock: z.string().regex(/^\d\d:\d\d$/),
  /** What the learner is told when the act begins. */
  narrative: z.string().min(1),
  /** How long after it begins the act can be over (its faults take a reconcile or two to show). */
  minDuration: z.string().default('+6m'),
  /** Timeline events, each `after` the act begins. */
  faults: z
    .array(z.looseObject({ type: z.string(), after: z.string().default('+0s') }))
    .default([]),
  /** The act is over when every objective holds. */
  objectives: z
    .array(z.strictObject({ id: slug, text: z.string().min(1), check: predicateSchema }))
    .min(1),
  evidence: z.strictObject(
    Object.fromEntries(SIGNALS.map((s) => [s, z.string().min(1)])) as Record<
      (typeof SIGNALS)[number],
      z.ZodString
    >,
  ),
  rootCause: z.string().min(1),
  /** Something that looks related but isn't. */
  redHerring: z.string().optional(),
  expertPath: z.array(expertStep).min(1),
  /** "What caused this?": asked once the act is over; scored in the debrief (E10-03). */
  diagnosis: z
    .strictObject({
      question: z.string().min(1),
      options: z
        .array(
          z.strictObject({
            id: slug,
            text: z.string().min(1),
            correct: z.boolean().default(false),
          }),
        )
        .min(2),
    })
    .refine((d) => d.options.filter((o) => o.correct).length === 1, 'exactly one option is correct')
    .optional(),
  /** Nudge, pointer, then the command (as challenges have). */
  hints: z
    .array(
      z.strictObject({ level: z.enum(['nudge', 'pointer', 'command']), text: z.string().min(1) }),
    )
    .default([]),
  /** Lessons to practise afterwards (for the debrief, E10-05). */
  practice: z.array(z.string()).default([]),
})
export type Act = z.output<typeof actSchema>

/** The scenario's acts, fully checked. */
export const actsOf = (scenario: Scenario): Act[] => z.array(actSchema).parse(scenario.acts)

/** Begins an act: schedules its faults. */
export function startAct(sim: Simulator, act: Act): void {
  for (const f of act.faults) {
    const { after, ...entry } = f
    sim.injectEvent(entry, parseDuration(after))
  }
}

/** Whether an objective holds now (the challenge engine's predicates, with the learner's commands). */
export function holds(sim: Simulator, check: Predicate, history: readonly string[] = []): boolean {
  const shim = challengeSchema.parse({
    id: 'capstone',
    title: 'Capstone',
    scenario: sim.scenario.id,
    brief: 'The capstone.',
    objectives: [{ id: 'o', text: 'o', check }],
    hints: [
      { level: 'nudge', text: '-' },
      { level: 'pointer', text: '-' },
      { level: 'command', text: '-' },
    ],
    expertPath: ['kubectl config current-context'],
  })
  return new ChallengeRun(sim, shim, history).check(check)
}

/** Whether every objective of the act holds (never before its `minDuration`). */
export const actSolved = (
  sim: Simulator,
  act: Act,
  startedAt: number,
  history: readonly string[] = [],
) =>
  sim.now - startedAt >= parseDuration(act.minDuration) &&
  act.objectives.every((o) => holds(sim, o.check, history))
