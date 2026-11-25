import { Link } from 'react-router'
import { Page } from './Page'

/** The 404 view, for unknown paths and for unknown region, lesson or term IDs. */
export function NotFound() {
  return (
    <Page title="This path doesn't lead anywhere yet">
      <p className="mt-4 max-w-prose">
        The page you were looking for isn&apos;t here. It may have moved, or the link may have a
        typo.
      </p>
      <p className="mt-4">
        <Link to="/" className="underline">
          Back to the Console Room
        </Link>
      </p>
    </Page>
  )
}
