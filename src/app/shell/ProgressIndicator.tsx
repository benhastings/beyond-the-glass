import { Suspense } from 'react'
import { courseOutline } from '@/content'
import { completedRegions } from '@/progress'
import { useManifest } from '../content'
import { useProgress } from '../progress'

function Count() {
  const manifest = useManifest()
  const progress = useProgress((s) => s.progress)
  const done = completedRegions(progress, courseOutline(manifest)).length
  const total = manifest.regions.length
  return (
    <>
      {done} of {total} regions complete
    </>
  )
}

/** "n of m regions complete" in the header. Fixed width while loading, so the header never shifts. */
export function ProgressIndicator() {
  return (
    <p className="inline-block min-w-[13rem] text-sm" data-testid="progress-indicator">
      <Suspense
        fallback={
          <span
            className="inline-block h-4 w-40 rounded bg-ink/15 align-middle"
            aria-hidden="true"
          />
        }
      >
        <Count />
      </Suspense>
    </p>
  )
}
