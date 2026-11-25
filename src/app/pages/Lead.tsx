import { lazy, Suspense } from 'react'
import { Page } from '../shell/Page'
import { PageSkeleton } from '../shell/Skeleton'

const LeadPanel = lazy(() => import('../lead/LeadPanel').then((m) => ({ default: m.LeadPanel })))

/** `/lead`: read learners' progress codes (E3-05). Nothing pasted here is stored. */
export default function Lead() {
  return (
    <Page title="Lead view">
      <p className="mt-4 max-w-prose print:hidden">
        Paste learners&apos; progress codes to see where each one is: their starting levels, the
        regions they’ve finished and when they were last active.
      </p>
      <div className="mt-6">
        <Suspense fallback={<PageSkeleton />}>
          <LeadPanel />
        </Suspense>
      </div>
    </Page>
  )
}
