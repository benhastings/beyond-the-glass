import { Link } from 'react-router'
import { Page } from '../shell/Page'

/** `/threshold/results`: "Your trail" (E4-04). */
export default function ThresholdResults() {
  return (
    <Page title="Your trail" mood="console">
      <p className="mt-4 max-w-prose">Your starting trail through the Reach will appear here.</p>
      <p className="mt-6">
        <Link to="/map" className="underline focus-visible:outline-2">
          View the map
        </Link>
      </p>
    </Page>
  )
}
