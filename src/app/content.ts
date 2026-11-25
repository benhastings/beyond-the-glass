import { use } from 'react'
import type { Manifest } from '@/content'

/**
 * The content manifest loads as its own chunk, so the shell can render before it arrives (E2-01.AC4)
 * and lesson content never weighs on the first paint. Components that need it call `useManifest()`
 * inside a Suspense boundary.
 */
let manifestPromise: Promise<Manifest> | undefined

export function loadManifest(): Promise<Manifest> {
  if (!manifestPromise) {
    const p = import('virtual:btg-content').then((m) => m.default)
    // Mark the promise settled the way React's `use` reads it, so once the manifest has loaded every
    // later render gets it synchronously instead of suspending again.
    void p.then(
      (value) => Object.assign(p, { status: 'fulfilled', value }),
      (reason: unknown) => Object.assign(p, { status: 'rejected', reason }),
    )
    manifestPromise = p
  }
  return manifestPromise
}

export function useManifest(): Manifest {
  return use(loadManifest())
}
