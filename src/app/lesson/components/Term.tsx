import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { useManifest } from '../../content'

/** A Field Guide term: links to its entry, with the plain-words definition as its description. */
export function Term({ id, children }: { id: string; children?: ReactNode }) {
  const entry = useManifest().glossary.find((t) => t.id === id)
  return (
    <Link
      to={`/guide/${id}`}
      title={entry?.eli5}
      className="underline decoration-dotted underline-offset-4"
    >
      {children ?? entry?.term ?? id}
    </Link>
  )
}
