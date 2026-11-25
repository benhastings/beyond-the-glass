import { Link, useParams } from 'react-router'
import { allLessons } from '@/content'
import { useManifest } from '../content'
import { NotFound } from '../shell/NotFound'
import { Page } from '../shell/Page'

const link = 'underline underline-offset-4'

/** `/guide/:term`: one Field Guide entry (E2-05). Unknown terms get the 404 view. */
export default function GuideTerm() {
  const { term = '' } = useParams()
  const manifest = useManifest()
  const entry = manifest.glossary.find((t) => t.id === term)
  if (!entry) return <NotFound />
  const introduced = entry.introducedIn
    ? allLessons(manifest).find((l) => l.id === entry.introducedIn)
    : undefined
  const usedIn = allLessons(manifest).filter((l) => l.terms.includes(entry.id))
  const rosetta = (manifest.rosetta ?? []).filter((r) => r.terms.includes(entry.id))
  const related = entry.related
    .map((r) => manifest.glossary.find((t) => t.id === r))
    .filter((t) => t !== undefined)
  return (
    <Page title={entry.term}>
      {entry.aliases.length > 0 && (
        <p className="mt-2 text-sm">Also called: {entry.aliases.join(', ')}</p>
      )}
      <h2 className="mt-6 text-lg font-bold">In plain words</h2>
      <p className="mt-1 max-w-prose">{entry.eli5}</p>
      <h2 className="mt-6 text-lg font-bold">For an operator</h2>
      <p className="mt-1 max-w-prose">{entry.operator}</p>
      {rosetta.map((r) => (
        <p key={r.then} className="mt-4 max-w-prose rounded-md border border-line p-3">
          <span className="font-bold">Then:</span> {r.then}. <span className="font-bold">Now:</span>{' '}
          {r.now}. {r.why}
        </p>
      ))}
      {related.length > 0 && (
        <p className="mt-6">
          Related:{' '}
          {related.map((t, i) => (
            <span key={t.id}>
              {i > 0 && ', '}
              <Link to={`/guide/${t.id}`} className={link}>
                {t.term}
              </Link>
            </span>
          ))}
        </p>
      )}
      {(introduced ?? usedIn[0]) && (
        <p className="mt-4">
          First met in{' '}
          <Link to={`/lesson/${(introduced ?? usedIn[0])?.id ?? ''}`} className={link}>
            {(introduced ?? usedIn[0])?.title}
          </Link>
        </p>
      )}
      <p className="mt-6">
        <Link to="/guide" className={link}>
          ← Field Guide
        </Link>
      </p>
    </Page>
  )
}
