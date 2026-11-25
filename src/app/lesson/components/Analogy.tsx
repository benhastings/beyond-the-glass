import type { ReactNode } from 'react'

/**
 * Ties a new idea to what the learner already knows from running servers: `then` is the on-prem
 * practice, `now` its Kubernetes counterpart. Both are shown as text, side by side or stacked.
 */
export function Analogy({
  then,
  now,
  children,
}: {
  then: string
  now: string
  children?: ReactNode
}) {
  return (
    <aside aria-label="Analogy" className="rounded-md border border-line bg-raised p-4">
      <dl className="grid gap-2 sm:grid-cols-2">
        <div>
          <dt className="text-sm font-bold">On your servers</dt>
          <dd>{then}</dd>
        </div>
        <div>
          <dt className="text-sm font-bold">In the cluster</dt>
          <dd>{now}</dd>
        </div>
      </dl>
      {children && <div className="mt-2">{children}</div>}
    </aside>
  )
}
