import { useSearchParams } from 'react-router'
import { journey } from '@/placement'
import { useManifest } from '../content'
import { ListView } from '../journey/ListView'
import { MapView } from '../journey/MapView'
import { useProgress } from '../progress'
import { Page } from '../shell/Page'
import { Button } from '../ui/Button'

/**
 * `/map`: the journey map (E2-03). Every region, with its status; none is locked. The list view shows the
 * same information as an ordered list, and screen-reader users get a link to it first.
 */
export default function JourneyMap() {
  const manifest = useManifest()
  const progress = useProgress((s) => s.progress)
  const [params, setParams] = useSearchParams()
  const view = params.get('view') === 'list' ? 'list' : 'map'
  const { regions } = journey(manifest, progress)
  const set = (v: 'map' | 'list') => {
    setParams(v === 'list' ? { view: 'list' } : {}, { replace: true })
  }
  return (
    <Page title="Map of the Reach">
      <a
        href="#/map?view=list"
        onClick={(e) => {
          e.preventDefault()
          set('list')
        }}
        className="sr-only focus:not-sr-only"
      >
        Show the regions as a list
      </a>
      <p className="mt-4 max-w-prose">
        Every region is open to you. The suggested next one is marked, but you can go anywhere.
      </p>
      <div className="mt-4 flex gap-2" role="group" aria-label="View">
        <Button
          aria-pressed={view === 'map'}
          onClick={() => {
            set('map')
          }}
        >
          Map view
        </Button>
        <Button
          aria-pressed={view === 'list'}
          onClick={() => {
            set('list')
          }}
        >
          List view
        </Button>
      </div>
      {view === 'map' ? <MapView regions={regions} /> : <ListView regions={regions} />}
    </Page>
  )
}
