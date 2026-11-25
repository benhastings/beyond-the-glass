import { badRelease } from './bad-release.ts'
import type { ScenarioFragment } from './define.ts'
import { driftSelfHeal } from './drift-self-heal.ts'
import { manualSync } from './manual-sync.ts'
import { syncFailed } from './sync-failed.ts'

/** Every GitOps scenario fragment (E7-06). To add one: a new file in this folder, plus one line here. */
export const FRAGMENTS = [
  driftSelfHeal,
  manualSync,
  syncFailed,
  badRelease,
] as unknown as readonly ScenarioFragment<never>[]

export function fragment(id: string): ScenarioFragment<never> | undefined {
  return FRAGMENTS.find((f) => (f as unknown as ScenarioFragment).id === id)
}

export {
  composeFragments,
  playExpertPath,
  type ExpertPath,
  type ExpertStep,
  type ScenarioFragment,
  type Target,
} from './define.ts'
