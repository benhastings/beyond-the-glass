import { loadSimulation } from '../controllers/index.ts'
import type { Scenario } from '../core/scenario.ts'
import type { Simulator } from '../core/simulator.ts'
import { createShell } from './index.ts'

/**
 * Re-derives a simulation at sim time `t` (E6-13): the scenario from the start, with each command the
 * learner ran replayed at the time it was run. Deterministic, so scrubbing back and forth always shows
 * the same state for the same time.
 */
export function replayTo(
  scenario: Scenario,
  t: number,
  commands: readonly { at?: number; command: string }[] = [],
): Simulator {
  const sim = loadSimulation(scenario)
  const sh = createShell(sim)
  for (const c of commands) {
    if (c.at === undefined || c.at > t) continue
    if (c.at > sim.now) sim.advanceTo(c.at)
    sh.run(c.command)
  }
  if (t > sim.now) sim.advanceTo(t)
  return sim
}
