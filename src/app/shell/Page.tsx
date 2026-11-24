import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react'
import { useLocation } from 'react-router'
import { documentTitle, usePageContext } from './page-context'

interface Props {
  /** The page's name: its `<h1>` and the first part of `document.title`. */
  title: string
  /** Heading content when it should differ visually from `title` (the text must still match). */
  heading?: ReactNode
  children?: ReactNode
}

/**
 * Every route renders one Page. It sets `document.title`, renders the route's only `<h1>`, and after a
 * navigation moves focus to that heading and announces the page (E2 SC3). The first page load keeps
 * focus where the browser put it, so the skip link stays first.
 */
export function Page({ title, heading, children }: Props) {
  const h1 = useRef<HTMLHeadingElement>(null)
  const { key } = useLocation()
  const { announce, initialKey } = usePageContext()

  // A layout effect runs as soon as the page commits, even while another part of the shell (the
  // progress indicator) is still waiting for content; a passive effect would wait for that.
  useLayoutEffect(() => {
    document.title = documentTitle(title)
  }, [title])

  useEffect(() => {
    if (key === initialKey) return
    // preventScroll: back/forward restores the old scroll position, and focus mustn't undo that.
    h1.current?.focus({ preventScroll: true })
    announce(title)
  }, [key, title, initialKey, announce])

  return (
    <>
      <h1
        ref={h1}
        tabIndex={-1}
        className="text-3xl font-bold outline-none focus-visible:outline-2"
      >
        {heading ?? title}
      </h1>
      {children}
    </>
  )
}
