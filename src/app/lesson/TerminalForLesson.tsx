import { CHALLENGES } from '@/challenges'
import { SCENARIOS } from '@/scenarios'
import type { Simulator } from '@/sim/core/simulator'
import { Callout } from '../ui'
import { ChallengeTerminal } from '../terminal/ChallengeTerminal'
import { ScenarioTerminal } from '../terminal/ScenarioTerminal'
import { PipelinesPanel } from '../gitops/PipelinesPanel'
import { SmallScreenNote } from '../ui/SmallScreenNote'

/** `<Terminal scenario="…" challenge="…">`: a terminal on the scenario, with the challenge beside it if given. */
export default function TerminalForLesson({
  scenario,
  challenge,
  view,
}: {
  scenario: string
  challenge?: string
  /** `pipelines`: the scenario's CI pipelines, with their job logs, beside the terminal (E9-07). */
  view?: 'pipelines'
}) {
  const s = SCENARIOS[scenario]
  const c = challenge ? CHALLENGES[challenge] : undefined
  if (!s)
    return (
      <Callout kind="warn">
        This terminal needs the scenario “{scenario}”, which isn’t available.
      </Callout>
    )
  const panel = view === 'pipelines' ? (sim: Simulator) => <PipelinesPanel sim={sim} /> : undefined
  const terminal = c ? (
    <ChallengeTerminal challenge={c} scenario={s} {...(panel ? { view: panel } : {})} />
  ) : (
    <ScenarioTerminal scenario={s} />
  )
  return (
    <>
      <SmallScreenNote what="The terminal" />
      {terminal}
    </>
  )
}
