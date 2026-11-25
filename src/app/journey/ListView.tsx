import { Link } from 'react-router'
import { regionLabel, type RegionJourney } from '@/placement'
import { StatusBadge } from './StatusBadge'

/** The same regions as the map, as an ordered list (E2-03). */
export function ListView({ regions }: { regions: RegionJourney[] }) {
  return (
    <ol className="mt-6 grid max-w-prose gap-4">
      {regions.map((r) => (
        <li key={r.id} className="rounded-md border border-line p-3">
          <Link
            to={`/region/${r.id}`}
            aria-label={regionLabel(r)}
            className="font-bold underline underline-offset-4"
          >
            {r.title}
          </Link>{' '}
          <StatusBadge status={r.status} />
          <p className="mt-1">{r.summary}</p>
          {r.modules.length > 0 && (
            <p className="mt-1 text-sm">
              {r.modulesDone} of {r.modules.length} modules · about {r.estimatedMinutes} minutes
            </p>
          )}
        </li>
      ))}
    </ol>
  )
}
