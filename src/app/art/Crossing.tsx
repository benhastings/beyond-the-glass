import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '../ui/Button'
import { ConsoleRoomScene } from './ConsoleRoomScene'
import { WorldMap } from './WorldMap'
import './crossing.css'

/** What the Crossing says, on screen and to screen readers on arrival. */
export const ARRIVAL = 'You step through the glass, into the Reach.'
/** How long each version runs, in ms: the full sequence, and the reduced-motion crossfade plus a beat to read the line. */
export const CROSSING_MS = { full: 2800, reduce: 1600 } as const

const reduced = () => document.documentElement.dataset.motion === 'reduce'

/**
 * The Crossing (E1-06): the camera pushes toward the glass, the screen ripples like water, light spills
 * through and the Reach is revealed. Under 3 s; Skip is focused at once and Esc skips; with reduced motion
 * it's a 400 ms crossfade with a line of narrative. Everything behind it is inert while it plays.
 * `onDone` runs once, whether it finished or was skipped.
 */
export function Crossing({ onDone }: { onDone: () => void }) {
  const id = useId()
  const [mode] = useState<'full' | 'reduce'>(() => (reduced() ? 'reduce' : 'full'))
  const [arrived, setArrived] = useState(false)
  const done = useRef(false)
  const finish = useRef(onDone)
  useEffect(() => {
    finish.current = onDone
  })
  useEffect(() => {
    const end = () => {
      if (done.current) return
      done.current = true
      finish.current()
    }
    const root = document.getElementById('root')
    root?.setAttribute('inert', '')
    // After the page's own focus handling (it focuses its heading on arrival): Skip first.
    const raf = requestAnimationFrame(() => {
      document.getElementById(`${id}-skip`)?.focus()
      setArrived(true)
    })
    const timer = window.setTimeout(end, CROSSING_MS[mode])
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        end()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      cancelAnimationFrame(raf)
      window.clearTimeout(timer)
      window.removeEventListener('keydown', onKey)
      root?.removeAttribute('inert')
    }
  }, [mode, id])
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${id}-title`}
      className="btg-crossing fixed inset-0 z-50 overflow-hidden"
      data-mode={mode}
      {...(arrived ? { 'data-arrived': '' } : {})}
    >
      <h2 id={`${id}-title`} className="sr-only">
        The Crossing
      </h2>
      <div className="btg-cross-scene absolute inset-0">
        <ConsoleRoomScene fill className="h-full w-full" />
      </div>
      {/* Rings as HTML, not SVG children, so the compositor moves them without repainting. */}
      <div aria-hidden="true" className="btg-cross-ripple absolute inset-0">
        <span className="btg-cross-ring" />
        <span className="btg-cross-ring" />
        <span className="btg-cross-ring" />
      </div>
      <div aria-hidden="true" className="btg-cross-light absolute inset-0 bg-[#bff4ea] opacity-0" />
      <div className="btg-cross-map absolute inset-0">
        <WorldMap fill className="h-full w-full" />
        <svg
          aria-hidden="true"
          className="btg-cross-shaft absolute inset-0 h-full w-full opacity-0"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          <path d="M18 0h10L48 100H30z M58 0h6l14 100H66z" fill="#fffbe6" />
        </svg>
      </div>
      <p
        aria-hidden="true"
        className="btg-cross-line absolute inset-x-0 bottom-24 mx-auto w-fit max-w-prose rounded-md bg-[#10272c] px-4 py-2 text-center text-lg text-[#ffffff]"
      >
        {ARRIVAL}
      </p>
      <Button
        id={`${id}-skip`}
        variant="primary"
        className="absolute right-6 bottom-6"
        onClick={() => {
          if (done.current) return
          done.current = true
          finish.current()
        }}
      >
        Skip (Esc)
      </Button>
    </div>,
    document.body,
  )
}
