import { useParams } from 'react-router'
import { useManifest } from '../content'
import { NotFound } from '../shell/NotFound'
import { Page } from '../shell/Page'

/** `/guide/:term`: one Field Guide entry (E2-05). Unknown terms get the 404 view. */
export default function GuideTerm() {
  const { term = '' } = useParams()
  const entry = useManifest().glossary.find((t) => t.id === term)
  if (!entry) return <NotFound />
  return (
    <Page title={entry.term}>
      <p className="mt-4 max-w-prose">{entry.eli5}</p>
      <p className="mt-4 max-w-prose">{entry.operator}</p>
    </Page>
  )
}
