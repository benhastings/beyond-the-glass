import { useState } from 'react'
import type { Scenario } from '@/sim/core/scenario'
import type { Simulator } from '@/sim/core/simulator'
import { loadSimulation, restoreSimulation } from '@/sim/controllers'
import { useProgress } from '../progress'
import { Terminal } from './Terminal'

/** Resumes from the saved snapshot when there is a usable one; otherwise starts the scenario fresh. */
function resume(scenario: Scenario, snapshot: unknown): Simulator {
  if (snapshot !== undefined)
    try {
      return restoreSimulation(scenario, snapshot)
    } catch {
      // A snapshot from an older scenario version: start over rather than fail.
    }
  return loadSimulation(scenario)
}

/** A terminal on one scenario, saved to progress after every command and restored on reload (E6-09.AC3). */
export function ScenarioTerminal({ scenario, label }: { scenario: Scenario; label?: string }) {
  const saveScenario = useProgress((s) => s.saveScenario)
  const [sim] = useState(() =>
    resume(scenario, useProgress.getState().progress.scenarios[scenario.id]?.snapshot),
  )
  return (
    <Terminal
      sim={sim}
      {...(label ? { label } : {})}
      onChange={() => {
        saveScenario(scenario.id, { snapshot: sim.snapshot() })
      }}
    />
  )
}
