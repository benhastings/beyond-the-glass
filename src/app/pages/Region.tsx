import { Link, useParams } from 'react-router'
import { findRegion } from '@/content'
import { useManifest } from '../content'
import { NotFound } from '../shell/NotFound'
import { Page } from '../shell/Page'

/** `/region/:regionId` (E2-04 builds the full template). Unknown regions get the 404 view. */
export default function Region() {
  const { regionId = '' } = useParams()
  const region = findRegion(useManifest(), regionId)
  if (!region) return <NotFound />
  return (
    <Page title={region.title}>
      <p className="mt-4 max-w-prose">{region.summary}</p>
      {region.id === 'stormwatch' && (
        <p className="mt-6">
          <Link to="/stormwatch" className="underline focus-visible:outline-2">
            Enter the war room
          </Link>
        </p>
      )}
    </Page>
  )
}
