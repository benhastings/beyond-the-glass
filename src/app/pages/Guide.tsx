import { useId, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { buildIndex, search } from '@/content'
import { useManifest } from '../content'
import { Page } from '../shell/Page'

const link = 'underline underline-offset-4'

/**
 * `/guide`: the Field Guide (E2-05). Search (in the browser, by name, alias or acronym), every term, and
 * the Rosetta Stone: what you knew, what it's called now, and why it changed.
 */
export default function Guide() {
  const { glossary, rosetta = [] } = useManifest()
  const index = useMemo(() => buildIndex(glossary, rosetta), [glossary, rosetta])
  const [query, setQuery] = useState('')
  const hits = search(index, query)
  const id = useId()
  const terms = [...glossary].sort((a, b) => a.term.localeCompare(b.term))
  return (
    <Page title="Field Guide">
      <form
        role="search"
        className="mt-4 max-w-prose"
        onSubmit={(e) => {
          e.preventDefault()
        }}
      >
        <label htmlFor={`${id}-q`} className="block font-bold">
          Search the Field Guide
        </label>
        <input
          id={`${id}-q`}
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
          }}
          placeholder="For example: HPA, OOM, Service"
          aria-describedby={`${id}-count`}
          className="mt-1 min-h-11 w-full rounded-md border border-line bg-raised px-3"
        />
        <p id={`${id}-count`} role="status" className="mt-1 text-sm">
          {query.trim() ? `${String(hits.length)} ${hits.length === 1 ? 'result' : 'results'}` : ''}
        </p>
        {hits.length > 0 && (
          <ul className="mt-2 grid gap-2" aria-label="Search results">
            {hits.map((h) => (
              <li key={`${h.kind}-${h.id}`}>
                {h.kind === 'term' ? (
                  <Link to={`/guide/${h.id}`} className={`font-bold ${link}`}>
                    {h.title}
                  </Link>
                ) : (
                  <a href={`#/guide#rosetta-${h.id}`} className={`font-bold ${link}`}>
                    {h.title}
                  </a>
                )}
                <span className="block text-sm">{h.detail}</span>
              </li>
            ))}
          </ul>
        )}
      </form>

      <section aria-labelledby="rosetta" className="mt-10">
        <h2 id="rosetta" className="text-xl font-bold">
          The Rosetta Stone
        </h2>
        <p className="mt-1 max-w-prose">
          What you knew on the NOC floor, what it’s called now, and why it changed.
        </p>
        {rosetta.length === 0 ? (
          <p className="mt-2">The Rosetta Stone is still being written.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[40rem] border-collapse text-left">
              <caption className="sr-only">
                The Rosetta Stone: then, now, and why it changed
              </caption>
              <thead>
                <tr className="border-b-2 border-line">
                  <th scope="col" className="p-2">
                    Then
                  </th>
                  <th scope="col" className="p-2">
                    Now
                  </th>
                  <th scope="col" className="p-2">
                    Why it changed
                  </th>
                </tr>
              </thead>
              <tbody>
                {rosetta.map((r, i) => (
                  <tr
                    key={r.then}
                    id={`rosetta-${String(i)}`}
                    className="border-b border-line align-top"
                  >
                    <th scope="row" className="p-2 font-normal">
                      {r.then}
                    </th>
                    <td className="p-2">
                      {r.terms[0] ? (
                        <Link to={`/guide/${r.terms[0]}`} className={link}>
                          {r.now}
                        </Link>
                      ) : (
                        r.now
                      )}
                    </td>
                    <td className="p-2">{r.why}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="terms" className="mt-10 max-w-prose">
        <h2 id="terms" className="text-xl font-bold">
          Every term
        </h2>
        {terms.length === 0 ? (
          <p className="mt-2">The Field Guide&apos;s entries are still being written.</p>
        ) : (
          <ul className="mt-2 grid gap-1">
            {terms.map((t) => (
              <li key={t.id}>
                <Link to={`/guide/${t.id}`} className={link}>
                  {t.term}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Page>
  )
}
