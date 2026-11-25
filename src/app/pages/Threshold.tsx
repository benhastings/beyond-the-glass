import { lazy, Suspense } from 'react'
import { Page } from '../shell/Page'
import { PageSkeleton } from '../shell/Skeleton'

// The bank and engine load only when the Threshold opens.
const Quiz = lazy(() => import('../threshold/Quiz').then((m) => ({ default: m.Quiz })))

/** `/threshold`: the placement quiz (E4-02). */
export default function Threshold() {
  return (
    <Page title="The Threshold" mood="console">
      <Suspense fallback={<PageSkeleton />}>
        <Quiz />
      </Suspense>
    </Page>
  )
}
