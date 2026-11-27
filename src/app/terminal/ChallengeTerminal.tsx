import { useEffect, useId, useMemo, useRef, useState, type ComponentType } from 'react'
import { attach, ChallengeRun, type Evaluation } from '@/sim/challenges/engine'
import type { Challenge } from '@/sim/challenges/schema'
import { transcript } from '@/sim/commands'
import type { Session } from '@/sim/commands/types'
import type { Scenario } from '@/sim/core/scenario'
import { loadSimulation, restoreSimulation } from '@/sim/controllers'
import type { Simulator } from '@/sim/core/simulator'
import { useProgress } from '../progress'
import { Button, Callout } from '../ui'
import { inspect } from '../inspector/registry'
import { Terminal } from './Terminal'

function resume(scenario: Scenario, snapshot: unknown): Simulator {
  if (snapshot !== undefined)
    try {
      return restoreSimulation(scenario, snapshot)
    } catch {
      // An older snapshot: start the scenario over.
    }
  return loadSimulation(scenario)
}

/**
 * A terminal with a challenge beside it (E6-10): the brief, a live checklist of objectives, hints on
 * request (recorded in progress; they never block completion), and a celebration when it's done.
 * Progress keeps the simulation snapshot, so the challenge resumes where it was.
 */
export function ChallengeTerminal({
  challenge,
  scenario,
  view: View,
}: {
  challenge: Challenge
  scenario: Scenario
  /** Something else to read about the same simulation, shown under the terminal (a lesson's `view`). */
  view?: ComponentType<{ sim: Simulator; onChange: () => void }>
}) {
  const saveScenario = useProgress((s) => s.saveScenario)
  const updateChallenge = useProgress((s) => s.updateChallenge)
  // A valid content ID ("ravenpost/find-the-failing-pod"), so the saved progress always validates on load.
  const key = `${scenario.id}/${challenge.id}`
  const [sim] = useState(() =>
    resume(scenario, useProgress.getState().progress.scenarios[key]?.snapshot),
  )
  const run = useMemo(
    () => new ChallengeRun(sim, challenge, transcript(sim).history),
    [sim, challenge],
  )
  const session = useMemo(() => {
    const s: Omit<Session, 'history'> = {}
    attach(run, s as Session)
    return s
  }, [run])
  useEffect(() => {
    inspect({ sim, scenario, run })
  }, [sim, scenario, run])
  const [evaluation, setEvaluation] = useState<Evaluation>(() => run.evaluate())
  const [hint, setHint] = useState<string>()
  const [announce, setAnnounce] = useState('')
  const before = useRef(evaluation)
  const id = useId()

  const refresh = () => {
    const e = run.evaluate()
    const newly = e.objectives.filter((o, i) => o.done && !before.current.objectives[i]?.done)
    if (e.complete && !before.current.complete)
      setAnnounce(`Challenge complete: ${challenge.title}.`)
    else if (newly.length) setAnnounce(`Done: ${newly.map((o) => o.text).join('; ')}.`)
    before.current = e
    setEvaluation(e)
    updateChallenge(challenge.id, {
      status: e.complete ? 'completed' : 'in-progress',
      hintsUsed: run.state.hintsUsed,
      commandsRun: transcript(sim).history.length,
    })
    saveScenario(key, { snapshot: sim.snapshot() })
  }
  // Answers and hints typed in the terminal update the checklist through onChange.
  useEffect(() => {
    before.current = evaluation
  }, [evaluation])

  const done = evaluation.objectives.filter((o) => o.done).length
  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(16rem,1fr)]">
      <div className="min-w-0">
        <Terminal
          sim={sim}
          session={session}
          onChange={refresh}
          label={`${challenge.title} terminal`}
        />
        {View && (
          <div className="mt-4">
            <View sim={sim} onChange={refresh} />
          </div>
        )}
      </div>
      <aside aria-labelledby={`${id}-title`} className="grid content-start gap-3">
        <h2 id={`${id}-title`} className="text-lg font-bold">
          {challenge.title}
        </h2>
        <p>{challenge.brief}</p>
        <h3 className="font-bold" id={`${id}-objectives`}>
          Objectives ({done} of {evaluation.objectives.length} done)
        </h3>
        <ul aria-labelledby={`${id}-objectives`} className="grid gap-1">
          {evaluation.objectives.map((o) => (
            <li key={o.id} className="flex gap-2">
              <span aria-hidden="true">{o.done ? '✓' : '○'}</span>
              <span>
                {o.text}
                <span className="sr-only">{o.done ? ' (done)' : ' (to do)'}</span>
              </span>
            </li>
          ))}
        </ul>
        {challenge.questions.length > 0 && (
          <p className="text-sm">
            Answer in the terminal:{' '}
            {challenge.questions.map((q) => (
              <span key={q.id} className="block">
                <code className="font-mono">answer {q.id} …</code> ({q.prompt})
              </span>
            ))}
          </p>
        )}
        {evaluation.warnings.map((w) => (
          <Callout key={w} kind="warn">
            {w}
          </Callout>
        ))}
        <div>
          <Button
            onClick={() => {
              setHint(run.nextHint())
              refresh()
            }}
          >
            {hint ? 'Next hint' : 'Show a hint'}
          </Button>
          {hint && <p className="mt-2">{hint}</p>}
        </div>
        {evaluation.complete && (
          <Callout kind="success">
            <span className="motion-safe:animate-[pulse_1s_ease-in-out_2]">
              Challenge complete. You found it the way an operator would.
            </span>
          </Callout>
        )}
        <div role="status" aria-live="polite" className="sr-only">
          {announce}
        </div>
      </aside>
    </div>
  )
}
