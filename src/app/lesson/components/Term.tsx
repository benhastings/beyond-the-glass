import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { useManifest } from '../../content'
import { Tooltip } from '../../ui/Tooltip'

/**
 * A Field Guide term in a lesson (E2-05): a link to its entry, with a preview of the plain-words definition
 * that opens on keyboard focus as well as hover and closes with Esc. The preview is also the link's
 * description, so screen readers hear it without opening anything.
 */
export function Term({ id, children }: { id: string; children?: ReactNode }) {
  const entry = useManifest().glossary.find((t) => t.id === id)
  const label = children ?? entry?.term ?? id
  const linkEl = (
    <Link to={`/guide/${id}`} className="underline decoration-dotted underline-offset-4">
      {label}
    </Link>
  )
  if (!entry) return linkEl
  return (
    <Tooltip
      content={
        <>
          <span className="font-bold">{entry.term}:</span> {entry.eli5}
        </>
      }
    >
      {linkEl}
    </Tooltip>
  )
}
