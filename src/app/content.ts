import { use } from 'react'
import type { Manifest } from '@/content'

/**
 * The content manifest loads as its own chunk, so the shell can render before it arrives (E2-01.AC4)
 * and lesson content never weighs on the first paint. Components that need it call `useManifest()`
 * inside a Suspense boundary.
 */
let manifestPromise: Promise<Manifest> | undefined

export function loadManifest(): Promise<Manifest> {
  manifestPromise ??= import('virtual:btg-content').then((m) => m.default)
  return manifestPromise
}

export function useManifest(): Manifest {
  return use(loadManifest())
}
