import { useEffect, useSyncExternalStore } from 'react'
import { useProgress } from '../progress'
import { applyDisplay, displayAttributes } from './display'

// Every supported browser has matchMedia; test DOMs may not, and then the OS preference reads as "no".
const media = (query: string) =>
  typeof window.matchMedia === 'function' ? window.matchMedia(query) : undefined

function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const m = media(query)
      if (!m) return () => undefined
      m.addEventListener('change', onChange)
      return () => {
        m.removeEventListener('change', onChange)
      }
    },
    () => media(query)?.matches ?? false,
  )
}

/** Keeps `<html>`'s motion, contrast and text size in step with settings and OS preferences. */
export function useDisplayPreferences(): void {
  const settings = useProgress((s) => s.progress.settings)
  const reducedMotion = useMedia('(prefers-reduced-motion: reduce)')
  const moreContrast = useMedia('(prefers-contrast: more)')
  useEffect(() => {
    applyDisplay(
      document.documentElement,
      displayAttributes(settings, { reducedMotion, moreContrast }),
    )
  }, [settings, reducedMotion, moreContrast])
}
