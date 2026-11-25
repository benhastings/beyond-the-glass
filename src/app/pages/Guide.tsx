import { Link } from 'react-router'
import { useManifest } from '../content'
import { Page } from '../shell/Page'

/** `/guide`: the Field Guide (E2-05). */
export default function Guide() {
  const { glossary } = useManifest()
  return (
    <Page title="Field Guide">
      {glossary.length === 0 ? (
        <p className="mt-4 max-w-prose">The Field Guide&apos;s entries are still being written.</p>
      ) : (
        <ul className="mt-6 space-y-2">
          {glossary.map((t) => (
            <li key={t.id}>
              <Link to={`/guide/${t.id}`} className="underline">
                {t.term}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Page>
  )
}
