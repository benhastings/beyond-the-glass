import { lazy, Suspense } from 'react'
import { Page } from '../shell/Page'
import { PageSkeleton } from '../shell/Skeleton'

const Results = lazy(() => import('../threshold/Results').then((m) => ({ default: m.Results })))

/** `/threshold/results`: "Your trail" (E4-04). */
export default function ThresholdResults() {
  return (
    <Page title="Your trail" mood="console">
      <Suspense fallback={<PageSkeleton />}>
        <Results />
      </Suspense>
    </Page>
  )
}
