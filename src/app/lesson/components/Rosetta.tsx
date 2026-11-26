import { useManifest } from '../../content'

/**
 * One Rosetta Stone entry, inline in a lesson (E9-01): what it was on the NOC floor, what it is now, and why
 * it changed. `id` is the entry's id in `content/rosetta.yaml`; the content build rejects one that isn't.
 */
export function Rosetta({ id }: { id: string }) {
  const entry = useManifest().rosetta?.find((e) => e.id === id)
  if (!entry) return null
  return (
    <aside
      aria-label="From the Rosetta Stone"
      className="rounded-md border border-line bg-raised p-4"
    >
      <dl className="grid gap-2 sm:grid-cols-3">
        <div>
          <dt className="text-sm font-bold">Then</dt>
          <dd>{entry.then}</dd>
        </div>
        <div>
          <dt className="text-sm font-bold">Now</dt>
          <dd>{entry.now}</dd>
        </div>
        <div>
          <dt className="text-sm font-bold">Why it changed</dt>
          <dd>{entry.why}</dd>
        </div>
      </dl>
    </aside>
  )
}
