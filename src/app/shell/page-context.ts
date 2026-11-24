import { createContext, useContext } from 'react'

export interface PageContextValue {
  /** Says something in the shell's polite live region. */
  announce: (message: string) => void
  /** The location key of the first page shown; focus isn't moved on initial load. */
  initialKey: string
}

export const PageContext = createContext<PageContextValue>({
  announce: () => undefined,
  initialKey: 'default',
})

export const usePageContext = () => useContext(PageContext)

export const SITE_NAME = 'Beyond the Glass'

export function documentTitle(title: string): string {
  return title === SITE_NAME ? SITE_NAME : `${title} · ${SITE_NAME}`
}
