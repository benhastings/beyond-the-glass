import { useMedia } from '../display/useDisplayPreferences'
import { Callout } from './Callout'

/**
 * On a phone (E11-03): a note that this part works best on a larger screen. It still works here; nothing is
 * hidden or blocked.
 */
export function SmallScreenNote({ what }: { what: string }) {
  const phone = useMedia('(max-width: 639px)')
  if (!phone) return null
  return (
    <Callout kind="info">
      {what} works best on a larger screen, such as a laptop. It still works here: scroll sideways
      in the terminal, and use the tabs to move between panes.
    </Callout>
  )
}
