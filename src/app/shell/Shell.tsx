import { Suspense, useCallback, useMemo, useRef, useState } from 'react'
import { Link, NavLink, Outlet, ScrollRestoration, useLocation } from 'react-router'
import { SkipLink } from '../ui/SkipLink'
import { useDisplayPreferences } from '../display/useDisplayPreferences'
import { useProgress } from '../progress'
import { RecoveryDialog } from '../progress/RecoveryDialog'
import { StorageNotice } from '../progress/StorageNotice'
import { PageContext, SITE_NAME } from './page-context'
import { ProgressIndicator } from './ProgressIndicator'
import { PageSkeleton } from './Skeleton'

const NAV = [
  { to: '/map', label: 'Map' },
  { to: '/guide', label: 'Field Guide' },
  { to: '/settings', label: 'Settings' },
] as const

const linkClass = 'rounded underline-offset-4 hover:underline aria-[current=page]:underline'

/**
 * The layout around every page: skip link, header with navigation and progress, `<main>` and footer,
 * plus the live region pages announce themselves in and the storage notice.
 */
export function Shell() {
  const location = useLocation()
  const [initialKey] = useState(location.key)
  const main = useRef<HTMLElement>(null)
  const [message, setMessage] = useState('')
  const storageFailure = useProgress((s) => s.storageFailure)
  const dismiss = useProgress((s) => s.dismissStorageFailure)
  const recovery = useProgress((s) => s.recovery)
  useDisplayPreferences()
  const dismissRecovery = useProgress((s) => s.dismissRecovery)

  // Clearing first makes a repeat of the same text (back to the same page) announce again.
  const announce = useCallback((text: string) => {
    setMessage('')
    requestAnimationFrame(() => {
      setMessage(text)
    })
  }, [])
  const context = useMemo(() => ({ announce, initialKey }), [announce, initialKey])

  return (
    <PageContext value={context}>
      <div className="flex min-h-screen flex-col bg-ground text-ink">
        <SkipLink target={main} />
        <header className="flex min-h-16 flex-wrap items-center gap-x-6 gap-y-2 border-b border-ink/20 px-6 py-3">
          <Link to="/" className={`${linkClass} text-lg font-bold`}>
            {SITE_NAME}
          </Link>
          <nav aria-label="Main">
            <ul className="flex flex-wrap gap-x-5">
              {NAV.map((n) => (
                <li key={n.to}>
                  <NavLink to={n.to} className={linkClass}>
                    {n.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
          <div className="ml-auto">
            <ProgressIndicator />
          </div>
        </header>
        <main id="main" ref={main} tabIndex={-1} className="flex-1 p-6 outline-none sm:p-8">
          <Suspense fallback={<PageSkeleton />}>
            <Outlet />
          </Suspense>
        </main>
        <footer className="border-t border-ink/20 px-6 py-4 text-sm">
          <p>
            Your progress stays in this browser. Nothing is sent anywhere.{' '}
            <Link to="/lead" className={linkClass}>
              Lead view
            </Link>
          </p>
        </footer>
        <div role="status" aria-live="polite" className="sr-only" data-testid="route-announcer">
          {message}
        </div>
        <StorageNotice failure={storageFailure} onDismiss={dismiss} />
        <RecoveryDialog
          recovery={recovery}
          onClose={() => {
            dismissRecovery()
            // The dialog had focus and is going away; give keyboard users a sensible place to resume.
            main.current?.focus()
          }}
        />
      </div>
      <ScrollRestoration />
    </PageContext>
  )
}
