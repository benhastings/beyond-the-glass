import { Link } from 'react-router'
import { Page } from '../shell/Page'
import { SITE_NAME } from '../shell/page-context'

/** `/`: the journey overview. E2-02 builds the real first view. */
export default function ConsoleRoom() {
  return (
    <Page title={SITE_NAME}>
      <p className="mt-4 max-w-prose">For years you watched the glass. Now step through it.</p>
      <p className="mt-6">
        <Link to="/threshold" className="underline focus-visible:outline-2">
          Step up to the Threshold
        </Link>
      </p>
    </Page>
  )
}
