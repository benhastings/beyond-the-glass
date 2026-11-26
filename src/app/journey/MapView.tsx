import { useRef, useState, type KeyboardEvent } from 'react'
import { Link } from 'react-router'
import { regionLabel, type RegionJourney } from '@/placement'
import { MAP_SIZE, MAP_SPOTS, WorldMap } from '../art/WorldMap'
import { cx, focusRing } from '../ui/styles'
import { StatusBadge } from './StatusBadge'

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
  // The region whose pin has focus: highlighted in the art, the others dimmed.
  const [focused, setFocused] = useState<string>()
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
  // Each region's pin sits on its place in the art (percent of the map); a region the art doesn't have yet
  // gets a spot along the bottom.
  const spot = (i: number): [number, number] => {
    const at = MAP_SPOTS[regions[i]?.id ?? '']
    return at
      ? [(at[0] / MAP_SIZE.width) * 100, (at[1] / MAP_SIZE.height) * 100]
      : [10 + ((i * 23) % 80), 90]
  }
  return (
    // The keydown handler implements the roving-tabindex arrow keys for the links inside.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      role="group"
      aria-label="Regions of the Reach. Use the arrow keys to move between them."
      onKeyDown={onKeyDown}
      className="relative mt-6 aspect-[900/640] w-full max-w-4xl overflow-hidden rounded-lg border border-line"
    >
      {/* The art (E1-05), with the region in focus highlighted and the others dimmed. */}
      <WorldMap highlight={focused} className="absolute inset-0 h-full w-full" />
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
              setFocused(r.id)
            }}
            onBlur={() => {
              setFocused(undefined)
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
