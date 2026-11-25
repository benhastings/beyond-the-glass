import { CHALLENGES } from '@/challenges'
import { SCENARIOS } from '@/scenarios'
import { Callout } from '../ui'
import { ChallengeTerminal } from '../terminal/ChallengeTerminal'
import { ScenarioTerminal } from '../terminal/ScenarioTerminal'

/** `<Terminal scenario="…" challenge="…">`: a terminal on the scenario, with the challenge beside it if given. */
export default function TerminalForLesson({
  scenario,
  challenge,
}: {
  scenario: string
  challenge?: string
}) {
  const s = SCENARIOS[scenario]
  const c = challenge ? CHALLENGES[challenge] : undefined
  if (!s)
    return (
      <Callout kind="warn">
        This terminal needs the scenario “{scenario}”, which isn’t available.
      </Callout>
    )
  if (c) return <ChallengeTerminal challenge={c} scenario={s} />
  return <ScenarioTerminal scenario={s} />
}
