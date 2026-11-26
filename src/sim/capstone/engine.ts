import { auditLog } from '../core/audit.ts'
import type { Scenario } from '../core/scenario.ts'
import type { Simulator } from '../core/simulator.ts'
import { application } from '../gitops/argo.ts'
import { mergeRequests } from '../gitops/git.ts'
import { LEARNER } from '../gitops/mr.ts'
import { actsOf, actSolved, startAct, type Act } from './script.ts'

/**
 * The capstone engine (E10-03): runs the acts in order, starting each when the one before is over, keeps
 * what the learner did, and scores it for the debrief (never during the incident: no time pressure). All
 * of it lives in the simulation's state, so a snapshot taken mid-incident resumes exactly.
 */
export interface Action {
  t: number
  act: number
  kind: 'command' | 'merge' | 'hint' | 'diagnosis'
  text: string
}

interface CapstoneState extends Record<string, unknown> {
  started: boolean
  act: number
  /** When each act began and (if it has) ended, sim ms. */
  startedAt: number[]
  endedAt: (number | null)[]
  actions: Action[]
  /** Merge requests already counted as actions. */
  seenMerges: number[]
  diagnoses: Record<string, string>
}

const STATE = 'capstone'
const state = (sim: Simulator) =>
  sim.state<CapstoneState>(STATE, () => ({
    started: false,
    act: 0,
    startedAt: [],
    endedAt: [],
    actions: [],
    seenMerges: [],
    diagnoses: {},
  }))

/** What makes a command risky, and why (the reckless-playthrough debrief, E10-03.AC2). */
export const RISKS: { pattern: RegExp; why: string }[] = [
  {
    pattern: /^kubectl delete (namespace|ns)\b/,
    why: 'Deleting a namespace deletes everything in it, at once. There is no undo.',
  },
  {
    pattern: /^kubectl delete (deployment|deploy|service|svc|configmap|cm|secret)s?\b/,
    why: 'Deleting what a service runs on is an outage you chose; on a GitOps-managed cluster Argo CD recreates it from Git anyway, so it rarely fixes anything.',
  },
  {
    pattern: /^kubectl delete (pods?|po)\b.*(--all|-l |--selector)/,
    why: 'Deleting every pod drops all their requests at once; the Deployment makes new ones from the same template, so whatever was wrong is still wrong.',
  },
  {
    pattern: /^kubectl scale\b.*--replicas[= ]0\b/,
    why: 'Scaling to zero takes the service down completely.',
  },
  {
    pattern: /^kubectl (edit|set|scale|label|annotate|apply|rollout (undo|restart))\b/,
    why: 'A hand-made change to a self-healing Argo CD app is put back within minutes; change Git through a merge request instead.',
  },
  {
    pattern: /^argocd app set \S+ --sync-policy (none|manual)\b/,
    why: 'With auto-sync off, nothing merged to Git deploys until it’s back on: say so in the channel, and turn it back on.',
  },
]
/** Commands that look before touching (the "evidence first" habit). */
const LOOKS =
  /^(kubectl (get|describe|logs|events|top|config (current-context|get-contexts))|argocd app (get|list|diff|history|wait))\b/
const CHANGES =
  /^(kubectl (delete|scale|edit|set|label|annotate|apply|rollout (undo|restart))|argocd app (sync|rollback|set))\b/

export interface ActScore {
  id: string
  title: string
  over: boolean
  startedAt: number
  endedAt?: number
  /** Something was looked at before the first change in this act. */
  evidenceFirst: boolean
  /** The act was fixed through Git (a merged merge request), not by hand. */
  gitops: boolean
  /** Changes made with kubectl in this act. */
  handChanges: string[]
  risky: { command: string; why: string }[]
  hints: number
  diagnosis?: { answer?: string; correct: boolean }
  /** Commands run while pointed at the wrong cluster. */
  wrongContext: string[]
}

export class CapstoneRun {
  readonly sim: Simulator
  readonly acts: Act[]
  constructor(sim: Simulator, scenario: Scenario = sim.scenario) {
    this.sim = sim
    this.acts = actsOf(scenario)
  }

  /** Begins the incident (once; resuming a snapshot does nothing). */
  start(): void {
    const st = state(this.sim)
    if (st.started || this.acts.length === 0) return
    st.started = true
    this.begin(0)
  }

  private begin(i: number): void {
    const st = state(this.sim)
    const act = this.acts[i]
    if (!act) return
    st.act = i
    st.startedAt[i] = this.sim.now
    st.endedAt[i] = null
    startAct(this.sim, act)
  }

  /** The act in progress (undefined once the night is over). */
  get current(): Act | undefined {
    const st = state(this.sim)
    return st.endedAt[st.act] === null ? this.acts[st.act] : undefined
  }
  get actIndex(): number {
    return state(this.sim).act
  }
  get finished(): boolean {
    const st = state(this.sim)
    return st.started && st.act === this.acts.length - 1 && st.endedAt[st.act] !== null
  }
  get actions(): readonly Action[] {
    return state(this.sim).actions
  }
  /** Every command the learner ran (for objectives such as ranCommand). */
  get history(): string[] {
    return state(this.sim)
      .actions.filter((a) => a.kind === 'command')
      .map((a) => a.text)
  }

  /** After each command the learner runs. */
  record(command: string): void {
    const st = state(this.sim)
    st.actions.push({ t: this.sim.now, act: st.act, kind: 'command', text: command.trim() })
    this.tick()
  }

  hint(): string | undefined {
    const st = state(this.sim)
    const act = this.current
    if (!act) return undefined
    const used = st.actions.filter((a) => a.act === st.act && a.kind === 'hint').length
    const h = act.hints[Math.min(used, act.hints.length - 1)]
    if (!h) return undefined
    st.actions.push({ t: this.sim.now, act: st.act, kind: 'hint', text: h.level })
    return h.text
  }

  /** The learner's answer to an act's "what caused this?". */
  diagnose(actId: string, optionId: string): boolean {
    const act = this.acts.find((a) => a.id === actId)
    const opt = act?.diagnosis?.options.find((o) => o.id === optionId)
    if (!act || !opt) return false
    const st = state(this.sim)
    st.diagnoses[actId] = optionId
    st.actions.push({
      t: this.sim.now,
      act: this.acts.indexOf(act),
      kind: 'diagnosis',
      text: optionId,
    })
    return opt.correct
  }

  /**
   * Time passing with nobody typing (the war room's gentle background clock). Advances in steps, so an act
   * that ends meanwhile hands over to the next on time.
   */
  idle(ms: number): void {
    for (let left = ms; left > 0; left -= 30_000) {
      this.sim.advance(Math.min(30_000, left))
      this.tick()
    }
  }

  /** Notes new merges, and moves to the next act when this one is over. */
  tick(): void {
    const st = state(this.sim)
    for (const mr of mergeRequests(this.sim))
      if (mr.state === 'merged' && mr.author === LEARNER && !st.seenMerges.includes(mr.id)) {
        st.seenMerges.push(mr.id)
        st.actions.push({
          t: this.sim.now,
          act: st.act,
          kind: 'merge',
          text: `!${String(mr.id)} ${mr.title}`,
        })
      }
    const act = this.current
    if (!act || !st.started) return
    if (actSolved(this.sim, act, st.startedAt[st.act] ?? 0, this.history)) {
      st.endedAt[st.act] = this.sim.now
      if (st.act + 1 < this.acts.length) this.begin(st.act + 1)
    }
  }

  /** The debrief's scores, per act (E10-05 shows them; nothing here is shown during the incident). */
  scores(): ActScore[] {
    const st = state(this.sim)
    const audit = auditLog(this.sim)
    return this.acts.map((act, i) => {
      const mine = st.actions.filter((a) => a.act === i)
      const commands = mine.filter((a) => a.kind === 'command').map((a) => a.text)
      const firstChange = mine.findIndex(
        (a) => (a.kind === 'command' && CHANGES.test(a.text)) || a.kind === 'merge',
      )
      const looked = mine.some(
        (a, k) =>
          a.kind === 'command' && LOOKS.test(a.text) && (firstChange < 0 || k < firstChange),
      )
      const start = st.startedAt[i] ?? 0
      const ended = st.endedAt[i]
      const end = typeof ended === 'number' ? ended : undefined
      const inAct = (t: number) => t >= start && (end === undefined || t <= end)
      const handChanges = audit
        .filter((e) => e.actor === 'learner' && inAct(e.t))
        .map((e) => e.command ?? `${e.verb} ${e.kind}/${e.name}`)
      const answer = st.diagnoses[act.id]
      return {
        id: act.id,
        title: act.title,
        over: end !== undefined,
        startedAt: start,
        ...(end !== undefined ? { endedAt: end } : {}),
        evidenceFirst: firstChange < 0 || looked,
        gitops: mine.some((a) => a.kind === 'merge') && handChanges.length === 0,
        handChanges: [...new Set(handChanges)],
        risky: commands.flatMap((c) => {
          const r = RISKS.find((x) => x.pattern.test(c))
          return r ? [{ command: c, why: r.why }] : []
        }),
        hints: mine.filter((a) => a.kind === 'hint').length,
        ...(act.diagnosis
          ? {
              diagnosis: {
                ...(answer ? { answer } : {}),
                correct: act.diagnosis.options.some((o) => o.id === answer && o.correct),
              },
            }
          : {}),
        wrongContext: this.wrongContext(i),
      }
    })
  }

  /** Changes made while pointed at a cluster other than the one in trouble (prod). */
  private wrongContext(i: number): string[] {
    const st = state(this.sim)
    const start = st.startedAt[i] ?? 0
    const end = st.endedAt[i] ?? Infinity
    const trouble = application(this.sim, 'ravenpost')?.destination.cluster ?? 'prod'
    return [
      ...new Set(
        auditLog(this.sim)
          .filter(
            (e) => e.actor === 'learner' && e.t >= start && e.t <= end && e.cluster !== trouble,
          )
          .map((e) => e.command ?? `${e.verb} ${e.kind}/${e.name}`),
      ),
    ]
  }
}
