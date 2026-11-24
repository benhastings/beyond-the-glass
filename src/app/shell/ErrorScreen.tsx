import { isRouteErrorResponse, Link, useRouteError } from 'react-router'
import { Page } from './Page'

/**
 * Shown instead of a page that failed to render. Progress is saved separately, so nothing is lost; the
 * learner can retry or go home.
 */
export function ErrorScreen() {
  const error = useRouteError()
  const detail = isRouteErrorResponse(error)
    ? `${String(error.status)} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : undefined
  return (
    <Page title="Something went wrong">
      <p className="mt-4 max-w-prose">
        This page ran into a problem and couldn&apos;t be shown. Your progress is safe: it&apos;s
        saved in this browser separately from the page.
      </p>
      <div className="mt-6 flex flex-wrap gap-4">
        <button
          type="button"
          className="rounded border border-current px-4 py-2 focus-visible:outline-2 focus-visible:outline-offset-2"
          onClick={() => {
            window.location.reload()
          }}
        >
          Try again
        </button>
        <Link to="/" className="rounded px-4 py-2 underline focus-visible:outline-2">
          Go to the Console Room
        </Link>
      </div>
      {detail && (
        <details className="mt-6 text-sm">
          <summary>Technical details</summary>
          <pre className="mt-2 whitespace-pre-wrap">{detail}</pre>
        </details>
      )}
    </Page>
  )
}

/** The same screen for a failure in the shell itself, with no layout around it. */
export function RootErrorScreen() {
  return (
    <main className="min-h-screen bg-ground p-8 text-ink">
      <ErrorScreen />
    </main>
  )
}
