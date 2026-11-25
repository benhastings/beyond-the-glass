import { useRef, useState, type KeyboardEvent } from 'react'
import { Link } from 'react-router'
import { regionLabel, type RegionJourney } from '@/placement'
import { cx, focusRing } from '../ui/styles'
import { StatusBadge } from './StatusBadge'

/** Where each region sits on the placeholder map (percent of the map's width and height), in journey order. */
const SPOTS = [
  [12, 78],
  [32, 58],
  [54, 72],
  [70, 46],
  [48, 28],
  [24, 22],
  [82, 14],
] as const

/**
 * The Reach as a map (E2-03): one link per region, placed along a path. Arrow keys move between regions
 * (roving tabindex), Enter opens one. Each link's name carries its status in words.
 */
export function MapView({ regions }: { regions: RegionJourney[] }) {
  const [active, setActive] = useState(() =>
    Math.max(
      0,
      regions.findIndex((r) => r.status === 'recommended'),
    ),
  )
  const links = useRef<(HTMLAnchorElement | null)[]>([])
  const move = (to: number) => {
    const i = (to + regions.length) % regions.length
    setActive(i)
    links.current[i]?.focus()
  }
  const onKeyDown = (e: KeyboardEvent) => {
    const keys: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }
    if (e.key in keys) {
      e.preventDefault()
      move(active + (keys[e.key] ?? 0))
    } else if (e.key === 'Home') {
      e.preventDefault()
      move(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      move(regions.length - 1)
    }
  }
  const spot = (i: number) => SPOTS[i] ?? [10 + ((i * 23) % 80), 10 + ((i * 37) % 80)]
  return (
    // The keydown handler implements the roving-tabindex arrow keys for the links inside.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      role="group"
      aria-label="Regions of the Reach. Use the arrow keys to move between them."
      onKeyDown={onKeyDown}
      className="relative mt-6 aspect-[4/3] w-full max-w-3xl rounded-lg border border-line bg-raised sm:aspect-[16/9]"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full"
      >
        <polyline
          points={regions.map((_, i) => spot(i).join(',')).join(' ')}
          fill="none"
          className="stroke-line"
          strokeWidth="0.6"
          strokeDasharray="2 1.5"
        />
      </svg>
      {regions.map((r, i) => {
        const [x, y] = spot(i)
        return (
          <Link
            key={r.id}
            ref={(el) => {
              links.current[i] = el
            }}
            to={`/region/${r.id}`}
            tabIndex={i === active ? 0 : -1}
            onFocus={() => {
              setActive(i)
            }}
            aria-label={regionLabel(r)}
            className={cx(
              'absolute grid -translate-x-1/2 -translate-y-1/2 justify-items-center gap-1 rounded-md bg-surface p-2 text-center shadow',
              focusRing,
            )}
            style={{ left: `${String(x)}%`, top: `${String(y)}%` }}
          >
            <span className="font-bold">{r.title}</span>
            <StatusBadge status={r.status} />
          </Link>
        )
      })}
    </div>
  )
}
