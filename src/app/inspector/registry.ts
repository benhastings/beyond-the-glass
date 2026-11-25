import type { ChallengeRun } from '@/sim/challenges/engine'
import type { Scenario } from '@/sim/core/scenario'
import type { Simulator } from '@/sim/core/simulator'

/** The simulation the dev inspector looks at (E6-13): the most recently opened terminal's. Dev builds only. */
export interface Inspected {
  sim: Simulator
  scenario: Scenario
  run?: ChallengeRun
}

let current: Inspected | undefined
const listeners = new Set<() => void>()

export function inspect(i: Inspected): void {
  if (!import.meta.env.DEV) return
  current = i
  for (const l of listeners) l()
}
export const inspected = () => current
export function onInspect(l: () => void): () => void {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}
