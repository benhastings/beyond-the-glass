import { useId } from 'react'
import { Link } from 'react-router'
import { findLesson } from '@/content'
import type { ActScore, CapstoneRun, Signal } from '@/sim/capstone/engine'
import { SIGNALS, type Act } from '@/sim/capstone/script'
import { useManifest } from '../content'
import { clockTime } from '../o11y/format'
import { cx, focusRing } from '../ui/styles'

const SIGNAL_NAMES: Record<Signal, string> = {
  kubectl: 'Cluster state (kubectl)',
  events: 'Events',
  logs: 'Logs',
  metrics: 'Metrics and dashboards',
  traces: 'Traces',
  argo: 'Argo CD',
}

type Step = Act['expertPath'][number]
function stepText(step: Step): string {
  if ('run' in step) return step.run
  if ('wait' in step) return `Wait ${step.wait}, watching the rollout`
  if ('mr' in step) return `Merge request to ${step.mr.repo} (${step.mr.file}): ${step.mr.message}`
  return `Revert the last change to ${step.revertMr.repo}, through a merge request`
}

/** What went well, from the scores (only what's true; never a grade). */
export function strengths(all: readonly ActScore[]): string[] {
  // Only the acts the learner reached.
  const scores = all.filter((s) => s.started)
  const n = scores.length
  const fallback = 'You stayed with the incident to the end. Everything else grows from that.'
  if (n === 0) return [fallback]
  const count = (f: (s: ActScore) => boolean) => scores.filter(f).length
  const out: string[] = []
  const looked = count((s) => s.evidenceFirst)
  if (looked === n) out.push('You looked before you changed anything, in every act.')
  else if (looked > 0)
    out.push(`You looked before you changed anything in ${String(looked)} of ${String(n)} acts.`)
  const git = count((s) => s.gitops)
  if (git > 0)
    out.push(
      `You fixed ${git === n ? 'every act' : `${String(git)} of ${String(n)} acts`} through Git, so the fix stayed fixed and the next person can see what changed.`,
    )
  if (
    scores.every((s) => s.wrongContext.length === 0) &&
    scores.some((s) => s.handChanges.length > 0 || s.gitops)
  )
    out.push('Every change you made was on the cluster that was in trouble.')
  const right = count((s) => s.diagnosis?.correct === true)
  if (right > 0) out.push(`You named the cause correctly in ${String(right)} of ${String(n)} acts.`)
  const broad = count((s) => SIGNALS.filter((sig) => s.looked[sig]).length >= 3)
  if (broad > 0)
    out.push(`You checked three or more kinds of signal in ${String(broad)} of ${String(n)} acts.`)
  if (out.length === 0) out.push(fallback)
  return out
}

/** Lessons to practise next: from the acts where something was missed, or every act's if nothing was. */
export function practiceNext(acts: readonly Act[], scores: readonly ActScore[]): string[] {
  const missedSomething = (s: ActScore | undefined) =>
    !s ||
    !s.over ||
    !s.evidenceFirst ||
    !s.gitops ||
    s.risky.length > 0 ||
    s.diagnosis?.correct === false ||
    SIGNALS.some((sig) => !s.looked[sig])
  const from = acts.filter((_, i) => scores[i]?.started === true && missedSomething(scores[i]))
  return [...new Set((from.length ? from : acts).flatMap((a) => a.practice))]
}

/**
 * The debrief (E10-05): what happened and what you did, act by act, in plain text: every list and table
 * reads top to bottom, and nothing is shown only as a picture. Blameless: it says what each signal showed
 * and what's worth knowing next time, never who was wrong.
 */
export function Debrief({
  run,
  notes,
  exemplar,
}: {
  run: CapstoneRun
  notes: string
  exemplar?: string | undefined
}) {
  const manifest = useManifest()
  const id = useId()
  const scores = run.scores()
  const epoch = run.sim.clock.epochMs
  const time = (t: number) => clockTime(epoch, t)
  const lessons = practiceNext(run.acts, scores).map((l) => ({
    id: l,
    title: findLesson(manifest, l)?.title ?? l,
  }))
  const timeline = [
    ...scores.map((s, i) => ({
      t: s.startedAt,
      order: 1,
      text: `Act ${String(i + 1)} began: ${s.title}.`,
      kind: 'incident' as const,
    })),
    ...scores.flatMap((s, i) =>
      s.endedAt === undefined
        ? []
        : [
            {
              t: s.endedAt,
              order: 0,
              text: `Act ${String(i + 1)} was over.`,
              kind: 'incident' as const,
            },
          ],
    ),
    ...run.actions
      .filter((a) => a.kind !== 'view')
      .map((a) => ({
        t: a.t,
        order: 2,
        kind: 'you' as const,
        text:
          a.kind === 'command'
            ? `You ran ${a.text}`
            : a.kind === 'merge'
              ? `You merged ${a.text}`
              : a.kind === 'hint'
                ? `You asked for a hint (${a.text})`
                : `You answered "what caused this?" for act ${String(a.act + 1)}`,
      })),
  ].sort((a, b) => a.t - b.t || a.order - b.order)
  const section = 'grid gap-3 rounded-sm border border-line bg-surface p-4'
  return (
    <section aria-labelledby={`${id}-title`} className="grid gap-4" data-testid="btg-debrief">
      <h2 id={`${id}-title`} tabIndex={-1} className={cx('text-2xl font-bold', focusRing)}>
        Debrief: The Long Night
      </h2>
      <p className="max-w-prose">
        The storm has passed. Here’s the night as it happened, what each signal was showing, and the
        habits worth keeping. It’s the after-action review a good team writes for itself: what
        happened and what helped, not who was at fault.
      </p>

      <section aria-labelledby={`${id}-strengths`} className={section}>
        <h3 id={`${id}-strengths`} className="text-xl font-bold">
          What went well
        </h3>
        <ul className="list-disc ps-6">
          {strengths(scores).map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      </section>

      {run.acts.map((act, i) => {
        const s = scores[i]
        if (!s) return null
        const answer = act.diagnosis?.options.find((o) => o.id === s.diagnosis?.answer)
        const right = act.diagnosis?.options.find((o) => o.correct)
        return (
          <section key={act.id} aria-labelledby={`${id}-${act.id}`} className={section}>
            <h3 id={`${id}-${act.id}`} className="text-xl font-bold">
              Act {i + 1}: {act.title}
            </h3>
            <p className="max-w-prose">
              <strong>What caused it: </strong>
              {act.rootCause}
            </p>
            {act.diagnosis && (
              <p className="max-w-prose">
                <strong>Your answer: </strong>
                {answer ? answer.text : 'not answered'}.{' '}
                {s.diagnosis?.correct ? 'That’s it.' : right ? `The cause was: ${right.text}.` : ''}
              </p>
            )}
            <table className="w-full border-collapse text-start text-sm">
              <caption className="text-start font-bold">The evidence, signal by signal</caption>
              <thead>
                <tr>
                  <th scope="col" className="border-b border-line p-2 text-start">
                    Signal
                  </th>
                  <th scope="col" className="border-b border-line p-2 text-start">
                    What it showed
                  </th>
                  <th scope="col" className="border-b border-line p-2 text-start">
                    You
                  </th>
                </tr>
              </thead>
              <tbody>
                {SIGNALS.map((sig) => (
                  <tr key={sig}>
                    <th
                      scope="row"
                      className="border-b border-line p-2 text-start align-top font-normal"
                    >
                      {SIGNAL_NAMES[sig]}
                    </th>
                    <td className="border-b border-line p-2 align-top">{act.evidence[sig]}</td>
                    <td className="border-b border-line p-2 align-top">
                      {s.looked[sig] ? 'Looked here' : 'Didn’t look here'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div>
              <h4 className="font-bold">One way through</h4>
              <ol className="list-decimal ps-6 font-mono text-sm">
                {act.expertPath.map((step, k) => (
                  <li key={k}>{stepText(step)}</li>
                ))}
              </ol>
            </div>
            {(s.risky.length > 0 || s.wrongContext.length > 0 || (s.over && !s.gitops)) && (
              <div>
                <h4 className="font-bold">Worth knowing next time</h4>
                <ul className="list-disc ps-6">
                  {s.risky.map((r) => (
                    <li key={r.command}>
                      <code>{r.command}</code>: {r.why}
                    </li>
                  ))}
                  {s.wrongContext.length > 0 && (
                    <li>
                      Some changes went to a cluster other than the one in trouble (
                      {s.wrongContext.join(', ')}). The prompt shows the context; a quick{' '}
                      <code>kubectl config current-context</code> before a change costs nothing.
                    </li>
                  )}
                  {s.over && !s.gitops && (
                    <li>
                      This act was put right without a merged merge request. On a self-healing Argo
                      CD app, a fix that isn’t in Git is put back the next time it syncs.
                    </li>
                  )}
                </ul>
              </div>
            )}
          </section>
        )
      })}

      <section aria-labelledby={`${id}-timeline`} className={section}>
        <h3 id={`${id}-timeline`} className="text-xl font-bold">
          The night, minute by minute
        </h3>
        <ol className="grid gap-1 text-sm">
          {timeline.map((e, k) => (
            <li key={k} className={e.kind === 'incident' ? 'font-bold' : ''}>
              <span className="font-mono">{time(e.t)}</span> {e.text}
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby={`${id}-notes`} className={section}>
        <h3 id={`${id}-notes`} className="text-xl font-bold">
          Incident notes
        </h3>
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <h4 className="font-bold">Your notes</h4>
            {notes.trim() ? (
              <pre className="whitespace-pre-wrap font-mono text-sm">{notes}</pre>
            ) : (
              <p>
                You didn’t keep notes this time. They help the next person, and the debrief after.
              </p>
            )}
          </div>
          {exemplar && (
            <div>
              <h4 className="font-bold">An example note</h4>
              <pre className="whitespace-pre-wrap font-mono text-sm">{exemplar}</pre>
            </div>
          )}
        </div>
      </section>

      <section aria-labelledby={`${id}-practice`} className={section}>
        <h3 id={`${id}-practice`} className="text-xl font-bold">
          Practice next
        </h3>
        <ul className="list-disc ps-6">
          {lessons.map((l) => (
            <li key={l.id}>
              <Link to={`/lesson/${l.id}`} className={cx('underline', focusRing)}>
                {l.title}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </section>
  )
}
