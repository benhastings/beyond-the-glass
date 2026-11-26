import { lazy, Suspense } from 'react'

// The simulator is large, so it loads only when a lesson shows a terminal (keeps the initial JS small).
const TerminalForLesson = lazy(() => import('../TerminalForLesson'))

/** `<Terminal scenario="…" challenge="…">`: a terminal on the scenario, with the challenge beside it if given. */
export function LessonTerminal(props: {
  scenario: string
  challenge?: string
  view?: 'pipelines' | 'changes' | 'argo' | 'dashboards' | 'promql'
}) {
  return (
    <Suspense fallback={<p className="font-mono text-sm">Opening the terminal…</p>}>
      <TerminalForLesson {...props} />
    </Suspense>
  )
}
