/**
 * What `<main>` shows while the content manifest loads: the same shape as a page (heading, two lines)
 * so nothing moves when it arrives.
 */
export function PageSkeleton() {
  return (
    <div aria-busy="true" data-testid="page-skeleton">
      <p className="sr-only">Loading…</p>
      <div className="h-9 w-2/3 max-w-md rounded bg-ink/15" />
      <div className="mt-4 h-5 w-full max-w-xl rounded bg-ink/10" />
      <div className="mt-2 h-5 w-5/6 max-w-lg rounded bg-ink/10" />
    </div>
  )
}
