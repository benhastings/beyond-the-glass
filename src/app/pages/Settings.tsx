import { lazy, Suspense } from 'react'
import { Page } from '../shell/Page'
import { PageSkeleton } from '../shell/Skeleton'

const SettingsPanel = lazy(() =>
  import('../settings/SettingsPanel').then((m) => ({ default: m.SettingsPanel })),
)

/** `/settings`: display preferences, Your Pack (export, import, start over) and your data (E2-06). */
export default function Settings() {
  return (
    <Page title="Settings">
      <div className="mt-6">
        <Suspense fallback={<PageSkeleton />}>
          <SettingsPanel />
        </Suspense>
      </div>
    </Page>
  )
}
