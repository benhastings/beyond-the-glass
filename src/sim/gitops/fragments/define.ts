import { z } from 'zod'
import type { Predicate } from '../../challenges/schema.ts'
import { createShell } from '../../commands/index.ts'
import { parseDuration } from '../../core/duration.ts'
import type { ScenarioInput } from '../../core/scenario.ts'
import type { Simulator } from '../../core/simulator.ts'
import { repo, resolve } from '../git.ts'
import { mergeMergeRequest, mrPipelines, proposeChange, proposeRevert } from '../mr.ts'

/**
 * Scenario fragments (E7-06): reusable GitOps situations a scenario (or the capstone, E10) adds to a world
 * that already has a deploy repo and an Argo CD application. Each one changes the scenario input (the
 * app's sync policy, timeline events, image behaviour), says when it's solved, and carries expert paths a
 * test replays to prove it can be solved. Add one: a new file in this folder, plus one line in ./index.ts.
 */

/** Where the fragment acts: the app, its deploy repo and manifest, and the Deployment it describes. */
export const targetSchema = z.strictObject({
  app: z.string(),
  repo: z.string(),
  /** The manifest in the deploy repo that holds the Deployment. */
  file: z.string(),
  namespace: z.string(),
  deployment: z.string(),
  /** The image without its tag, and the tag the Deployment runs now. */
  image: z.string(),
  tag: z.string(),
  /** When the fragment's trouble starts (an offset from the scenario's start). */
  at: z.string().default('+5m'),
})
export type Target = z.output<typeof targetSchema>

/** The sync policy a fragment needs on its app: automated (with or without self-heal), or manual. */
export type PolicyNeed = { automated: { prune: boolean; selfHeal: boolean } } | 'manual'

/** One step of an expert's solution, as data the capstone can replay too. */
export type ExpertStep =
  | { run: string }
  /** Change a file through a merge request: wait for its pipeline, then merge. */
  | { mr: { repo: string; file: string; replace: [string, string]; message: string } }
  /** Revert the default branch's newest commit through a merge request, then merge. */
  | { revertMr: { repo: string } }
  | { wait: string }

export interface ExpertPath {
  name: string
  /** Why an expert might choose it, and what it costs. */
  tradeOff: string
  steps: ExpertStep[]
}

export interface ScenarioFragment<P extends Target = Target> {
  id: string
  title: string
  /** What the learner sees happen. */
  situation: string
  /** What it teaches. */
  lesson: string
  params: z.ZodType<P, z.input<typeof targetSchema> & Record<string, unknown>>
  policy: PolicyNeed
  /** Changes to the scenario besides the policy: timeline events, image behaviour. */
  apply: (input: ScenarioInput, p: P) => ScenarioInput
  /** True once the learner has dealt with it (a challenge objective). */
  solved: (p: P) => Predicate
  expertPaths: (p: P) => ExpertPath[]
}

export function defineFragment<P extends Target>(f: ScenarioFragment<P>): ScenarioFragment<P> {
  return f
}

const policyKey = (p: PolicyNeed) => JSON.stringify(p)

/**
 * Adds fragments to a scenario input, setting each app's sync policy. Two fragments that need different
 * policies on the same app can't share it: that throws, naming both.
 */
export function composeFragments(
  input: ScenarioInput,
  uses: { fragment: ScenarioFragment<never>; params: Record<string, unknown> }[],
): ScenarioInput {
  let out = structuredClone(input)
  const chosen = new Map<string, { id: string; policy: PolicyNeed }>()
  for (const u of uses) {
    const f = u.fragment as unknown as ScenarioFragment
    const p = f.params.parse(u.params)
    const before = chosen.get(p.app)
    if (before && policyKey(before.policy) !== policyKey(f.policy))
      throw new Error(
        `fragments ${before.id} and ${f.id} need different sync policies for app ${p.app}`,
      )
    chosen.set(p.app, { id: f.id, policy: f.policy })
    const app = out.gitops?.applications?.find((a) => a.name === p.app)
    if (!app) throw new Error(`fragment ${f.id}: the scenario has no Argo CD application ${p.app}`)
    if (f.policy === 'manual') delete app.syncPolicy
    else app.syncPolicy = { automated: { ...f.policy.automated } }
    out = f.apply(out, p)
  }
  return out
}

/** Appends timeline entries (kept in time order, as authors write them). */
export function withTimeline(
  input: ScenarioInput,
  entries: NonNullable<ScenarioInput['timeline']>,
): ScenarioInput {
  const timeline = [...(input.timeline ?? []), ...entries]
  return { ...input, timeline: timeline.sort((a, b) => parseDuration(a.at) - parseDuration(b.at)) }
}

/** Runs an expert path against a simulation; returns the commands run (the challenge engine's history). */
export function playExpertPath(sim: Simulator, steps: readonly ExpertStep[]): string[] {
  const shell = createShell(sim)
  const history: string[] = []
  const settleAndMerge = (id: number) => {
    for (let i = 0; i < 180 && mrPipelines(sim, id).some((x) => x.status === 'running'); i++)
      sim.advance(10_000)
    mergeMergeRequest(sim, id)
  }
  for (const step of steps) {
    if ('run' in step) {
      shell.run(step.run)
      history.push(step.run)
    } else if ('wait' in step) sim.advance(parseDuration(step.wait))
    else if ('mr' in step) {
      const r = repo(sim, step.mr.repo)
      const text = r && resolve(r, r.defaultBranch)?.files[step.mr.file]
      if (text === undefined || !text.includes(step.mr.replace[0]))
        throw new Error(
          `expert path: "${step.mr.replace[0]}" isn't in ${step.mr.repo}/${step.mr.file}`,
        )
      const { mr } = proposeChange(sim, {
        repo: step.mr.repo,
        changes: { [step.mr.file]: text.replace(step.mr.replace[0], step.mr.replace[1]) },
        message: step.mr.message,
      })
      settleAndMerge(mr.id)
    } else settleAndMerge(proposeRevert(sim, step.revertMr.repo).mr.id)
  }
  return history
}
