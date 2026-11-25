import { Link } from 'react-router'
import { useManifest } from '../content'
import { Page } from '../shell/Page'

/** `/map`: the journey map (E2-03). For now, the list view every map also has. */
export default function JourneyMap() {
  const { regions } = useManifest()
  return (
    <Page title="Map of the Reach">
      <ol className="mt-6 space-y-4">
        {regions.map((r) => (
          <li key={r.id}>
            <Link to={`/region/${r.id}`} className="font-bold underline">
              {r.title}
            </Link>
            <p className="max-w-prose">{r.summary}</p>
          </li>
        ))}
      </ol>
    </Page>
  )
}
