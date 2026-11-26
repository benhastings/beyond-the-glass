import { lazy, Suspense } from 'react'
import { Page } from '../shell/Page'

// The war room (E10-04) is its own chunk: only /stormwatch downloads it.
const WarRoom = lazy(() => import('../stormwatch/WarRoom'))

/** `/stormwatch`: the capstone war room, "The Long Night" (E10). */
export default function Stormwatch() {
  return (
    <Page title="Stormwatch" mood="stormwatch" region="stormwatch">
      <p className="mt-2 max-w-prose">
        Night at the Stormwatch tower. The pager has gone, and the storm is building. Take your
        time: nothing here is timed, and the debrief comes after.
      </p>
      <div className="mt-4">
        <Suspense fallback={<p role="status">Opening the war room…</p>}>
          <WarRoom />
        </Suspense>
      </div>
    </Page>
  )
}
