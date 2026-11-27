import { CHALLENGES } from '@/challenges'
import type { ComponentType } from 'react'
import { SCENARIOS } from '@/scenarios'
import type { Simulator } from '@/sim/core/simulator'
import { Callout } from '../ui'
import { ChallengeTerminal } from '../terminal/ChallengeTerminal'
import { ScenarioTerminal } from '../terminal/ScenarioTerminal'
import { ArgoConsole } from '../gitops/argo/ArgoConsole'
import { MergeRequestFlow } from '../gitops/MergeRequestFlow'
import { PipelinesPanel } from '../gitops/PipelinesPanel'
import { DashboardView } from '../o11y/dashboards/DashboardView'
import { ObservabilityWorkspace } from '../o11y/ObservabilityWorkspace'
import { PromqlExplorer } from '../o11y/PromqlExplorer'
import { SmallScreenNote } from '../ui/SmallScreenNote'

export type LessonView =
  'pipelines' | 'changes' | 'argo' | 'dashboards' | 'promql' | 'observability'

type ViewProps = { sim: Simulator; onChange: () => void }
const VIEWS: Record<LessonView, ComponentType<ViewProps>> = {
  pipelines: ({ sim }) => <PipelinesPanel sim={sim} />,
  changes: ({ sim, onChange }) => (
    <MergeRequestFlow
      sim={sim}
      repo="ravenpost-deploy"
      app="ravenpost"
      onChange={onChange}
      level={3}
    />
  ),
  argo: ({ sim, onChange }) => <ArgoConsole sim={sim} onChange={onChange} level={3} />,
  dashboards: ({ sim }) => <DashboardView sim={sim} />,
  promql: ({ sim }) => <PromqlExplorer sim={sim} level={3} />,
  observability: ({ sim }) => <ObservabilityWorkspace sim={sim} />,
}

/** `<Terminal scenario="…" challenge="…">`: a terminal on the scenario, with the challenge beside it if given. */
export default function TerminalForLesson({
  scenario,
  challenge,
  view,
}: {
  scenario: string
  challenge?: string
  /**
   * Another view of the same simulation under the terminal: `pipelines` (CI, E9-07); `changes` (merge
   * requests to the deploy repo) or `argo` (the Argo CD console), for Mirror Lake (E9-08); `dashboards` or
   * `promql` (the metrics explorer), for Signalwood (E9-09); `observability` (dashboards, traces and logs,
   * linked), for E9-10.
   */
  view?: LessonView
}) {
  const s = SCENARIOS[scenario]
  const c = challenge ? CHALLENGES[challenge] : undefined
  if (!s)
    return (
      <Callout kind="warn">
        This terminal needs the scenario “{scenario}”, which isn’t available.
      </Callout>
    )
  const panel = view ? VIEWS[view] : undefined
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
