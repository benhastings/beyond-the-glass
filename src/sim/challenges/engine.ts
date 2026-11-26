import { auditLog } from '../core/audit.ts'
import type { Resource } from '../core/resources.ts'
import { readPath } from '../core/path.ts'
import { application, compareApp } from '../gitops/argo.ts'
import { mergeRequests, repo } from '../gitops/git.ts'
import { playExpertPath } from '../gitops/fragments/define.ts'
import { ancestors, LEARNER } from '../gitops/mr.ts'
import type { Simulator } from '../core/simulator.ts'
import type { Session } from '../commands/types.ts'
import type { Challenge, Predicate } from './schema.ts'

/**
 * Evaluates a challenge against the simulation (E6-10): objectives over cluster state, command history,
 * the audit log and the learner's answers; forbidden commands; and the hint ladder. Its own state
 * (answers, hints used, completion) is kept in the simulation, so it survives a reload with everything else.
 */
export interface ChallengeState extends Record<string, unknown> {
  answers: Record<string, string>
  hintsUsed: number
  completedAt?: number
}

export interface Evaluation {
  objectives: { id: string; text: string; done: boolean }[]
  /** Forbidden commands that were run, with why they'd be harmful. */
  warnings: string[]
  complete: boolean
}

type Ref = Extract<Predicate, { type: 'resourceState' }>['resource']

const text = (v: unknown): string =>
  v === undefined || v === null ? '' : typeof v === 'string' ? v : JSON.stringify(v)

export function selectResources(sim: Simulator, ref: Ref): Resource[] {
  const list = sim.cluster().list(ref.kind, {
    ...(ref.namespace ? { namespace: ref.namespace } : {}),
    ...(ref.labels ? { selector: { matchLabels: ref.labels } } : {}),
  }) as Resource[]
  return list.filter(
    (o) =>
      !('deletionTimestamp' in o.metadata && o.metadata.deletionTimestamp) &&
      (ref.name === undefined || o.metadata.name === ref.name) &&
      (ref.namePrefix === undefined || o.metadata.name.startsWith(ref.namePrefix)) &&
      (!ref.where || text(readPath(o, ref.where.path)) === ref.where.equals),
  )
}

export class ChallengeRun {
  readonly sim: Simulator
  readonly challenge: Challenge
  /** The terminal's command history (shared with the shell, so it's always current). */
  readonly history: readonly string[]

  constructor(sim: Simulator, challenge: Challenge, history: readonly string[]) {
    this.sim = sim
    this.challenge = challenge
    this.history = history
  }

  get state(): ChallengeState {
    return this.sim.state<ChallengeState>(`challenge:${this.challenge.id}`, () => ({
      answers: {},
      hintsUsed: 0,
    }))
  }

  check(p: Predicate): boolean {
    switch (p.type) {
      case 'ranCommand': {
        const re = new RegExp(p.pattern)
        return this.history.some((l) => re.test(l))
      }
      case 'noForbidden': {
        const re = new RegExp(p.pattern)
        return !this.history.some((l) => re.test(l))
      }
      case 'resourceState': {
        const objs = selectResources(this.sim, p.resource)
        const ok = (o: Resource) => {
          const v = text(readPath(o, p.path))
          return (
            (p.equals === undefined || v === p.equals) &&
            (p.matches === undefined || new RegExp(p.matches).test(v))
          )
        }
        if (p.quantifier === 'none') return !objs.some(ok)
        if (p.quantifier === 'any') return objs.some(ok)
        return objs.length > 0 && objs.every(ok)
      }
      case 'answered': {
        const a = this.state.answers[p.question]?.trim()
        if (!a) return false
        const m = p.matcher
        if ('equals' in m)
          return m.caseSensitive ? a === m.equals : a.toLowerCase() === m.equals.toLowerCase()
        if ('matches' in m) return new RegExp(m.matches, 'i').test(a)
        const names = selectResources(this.sim, m.resource).map((o) => o.metadata.name)
        if (names.includes(a)) return true
        if (!m.allowPrefix || a.length < 3) return false
        // A prefix counts only if it names one of them and nothing else of that kind there.
        const all = selectResources(this.sim, {
          ...m.resource,
          where: undefined,
          name: undefined,
          namePrefix: undefined,
          labels: undefined,
        })
        const hits = all.filter((o) => o.metadata.name.startsWith(a))
        return hits.length > 0 && hits.every((o) => names.includes(o.metadata.name))
      }
      case 'changedVia': {
        const log = auditLog(this.sim).filter((e) => e.kind === p.kind && e.name === p.name)
        const byKubectl = log.some((e) => e.actor === 'learner')
        const byMr = log.some((e) => {
          if (e.actor !== 'argocd' || (e.verb !== 'sync' && e.verb !== 'prune')) return false
          const appName = typeof e.detail?.app === 'string' ? e.detail.app : ''
          const revision = typeof e.detail?.revision === 'string' ? e.detail.revision : ''
          const r = repo(this.sim, application(this.sim, appName)?.source.repo ?? '')
          if (!r) return false
          const reached = ancestors(r, revision)
          return mergeRequests(this.sim, r.name).some(
            (m) =>
              m.state === 'merged' &&
              m.author === LEARNER &&
              m.mergedSha !== undefined &&
              reached.has(m.mergedSha),
          )
        })
        return p.via === 'mr' ? byMr && !(p.only && byKubectl) : byKubectl && !(p.only && byMr)
      }
      case 'mergedRequest':
        return mergeRequests(this.sim, p.repo).some(
          (m) => m.state === 'merged' && m.author === LEARNER,
        )
      case 'argoApp': {
        const now = compareApp(this.sim, p.app)
        const op = application(this.sim, p.app)?.status.operationState
        return (
          now !== undefined &&
          (p.sync === undefined || now.sync === p.sync) &&
          (p.health === undefined || now.health === p.health) &&
          (p.operation === undefined || op?.phase === p.operation)
        )
      }
      case 'mutated':
        return auditLog(this.sim).some(
          (e) =>
            e.actor === 'learner' &&
            e.verb === p.verb &&
            (p.kind === undefined || e.kind === p.kind) &&
            (p.name === undefined || e.name === p.name) &&
            (p.cluster === undefined || e.cluster === p.cluster),
        )
      case 'noMutation':
        return !auditLog(this.sim).some(
          (e) =>
            e.actor === 'learner' &&
            (p.cluster === undefined || e.cluster === p.cluster) &&
            (p.kind === undefined || e.kind === p.kind) &&
            (p.name === undefined || e.name === p.name),
        )
      case 'all':
        return p.of.every((x) => this.check(x))
      case 'any':
        return p.of.some((x) => this.check(x))
    }
  }

  evaluate(): Evaluation {
    const objectives = this.challenge.objectives.map((o) => ({
      id: o.id,
      text: o.text,
      done: this.check(o.check),
    }))
    const learnerChanges = (cluster: string) =>
      auditLog(this.sim)
        .filter((e) => e.actor === 'learner' && e.cluster === cluster)
        .map((e) => e.command ?? '')
    const warnings = this.challenge.forbidden
      .filter((f) =>
        (f.cluster === undefined ? this.history : learnerChanges(f.cluster)).some((l) =>
          new RegExp(f.pattern).test(l),
        ),
      )
      .map((f) => f.message)
    const complete = objectives.every((o) => o.done)
    if (complete && this.state.completedAt === undefined) this.state.completedAt = this.sim.now
    return { objectives, warnings, complete: complete || this.state.completedAt !== undefined }
  }

  answer(question: string, value: string): string {
    const q = this.challenge.questions.find((x) => x.id === question)
    if (!q)
      return `There's no question "${question}" in this challenge. Questions: ${this.challenge.questions.map((x) => x.id).join(', ') || 'none'}.`
    this.state.answers[question] = value
    const done = this.challenge.objectives.some(
      (o) => o.check.type === 'answered' && o.check.question === question && this.check(o.check),
    )
    return done
      ? `Answer recorded for "${q.prompt}". That's right.`
      : `Answer recorded for "${q.prompt}". Not quite: look again, and answer as often as you like.`
  }

  /** The next rung of the hint ladder, recording that it was used. Hints never affect completion. */
  nextHint(): string {
    const hints = this.challenge.hints
    const i = Math.min(this.state.hintsUsed, hints.length - 1)
    if (this.state.hintsUsed < hints.length) this.state.hintsUsed += 1
    const h = hints[i]
    return h
      ? `Hint ${String(i + 1)} of ${String(hints.length)} (${h.level}): ${h.text}`
      : 'No hints for this one.'
  }
}

/** Connects a run to a terminal session, so `hint` and `answer` reach it. */
export function attach(run: ChallengeRun, session: Session): void {
  session.hint = () => run.nextHint()
  session.answer = (q, t) => run.answer(q, t)
}

/**
 * Plays a challenge's expert path in a terminal session (tests, and the E9-08 GitOps challenges): shell
 * lines run in `run`'s session, so they count as the learner's commands; merge requests and waits go
 * through the GitOps machinery as the fragments' expert paths do. Returns each shell line's exit code.
 */
export function playChallengePath(
  sim: Simulator,
  shell: { run: (line: string) => { exitCode: number } },
  steps: Challenge['expertPath'],
): { step: string; exitCode: number }[] {
  const out: { step: string; exitCode: number }[] = []
  for (const step of steps) {
    if (typeof step === 'string') out.push({ step, exitCode: shell.run(step).exitCode })
    else {
      playExpertPath(sim, [step])
      out.push({ step: JSON.stringify(step), exitCode: 0 })
    }
  }
  return out
}
