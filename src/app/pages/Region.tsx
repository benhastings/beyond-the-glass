import { Link, useParams } from 'react-router'
import { findRegion } from '@/content'
import { journey } from '@/placement'
import { useManifest } from '../content'
import { StatusBadge } from '../journey/StatusBadge'
import { useProgress } from '../progress'
import { NotFound } from '../shell/NotFound'
import { RegionVignette } from '../art/vignettes'
import { Page } from '../shell/Page'

const link = 'underline underline-offset-4'

/**
 * `/region/:regionId`: one region of the journey (E2-04), rendered entirely from the content manifest:
 * its vignette, intro, what you'll learn, its modules with status and time, and the regions either side.
 */
export default function Region() {
  const { regionId = '' } = useParams()
  const manifest = useManifest()
  const progress = useProgress((s) => s.progress)
  const region = findRegion(manifest, regionId)
  if (!region) return <NotFound />
  const { regions } = journey(manifest, progress)
  const index = regions.findIndex((r) => r.id === region.id)
  const here = regions[index]
  const prev = regions[index - 1]
  const next = regions[index + 1]
  const outcomes = region.outcomes ?? []
  return (
    <Page
      title={region.title}
      mood={region.mood}
      region={region.id}
      accentHeading={region.mood === 'reach'}
    >
      {here && (
        <p className="mt-2">
          <StatusBadge status={here.status} />
        </p>
      )}
      {/* The region's vignette (E1-05): decorative; the heading names the region. */}
      <RegionVignette
        id={region.id}
        className="mt-4 block aspect-[4/1] h-auto w-full max-w-prose rounded-lg"
      />
      <p
        className={`mt-4 max-w-prose rounded-lg p-4 ${region.mood === 'reach' ? 'bg-region-soft' : 'bg-raised'}`}
        data-testid="region-summary"
      >
        {region.intro ?? region.summary}
      </p>
      {outcomes.length > 0 && (
        <section aria-labelledby="learn" className="mt-6 max-w-prose">
          <h2 id="learn" className="text-xl font-bold">
            What you’ll learn
          </h2>
          <ul className="mt-2 list-disc pl-6">
            {outcomes.map((o) => (
              <li key={o}>{o}</li>
            ))}
          </ul>
        </section>
      )}
      <section aria-labelledby="modules" className="mt-6 max-w-prose">
        <h2 id="modules" className="text-xl font-bold">
          Modules
        </h2>
        {region.modules.length === 0 ? (
          <p className="mt-2">The lessons for this region are on their way.</p>
        ) : (
          <ol className="mt-2 grid gap-3">
            {region.modules.map((m, i) => {
              const j = here?.modules[i]
              const first = m.lessons[0]
              return (
                <li key={m.id} className="rounded-md border border-line p-3">
                  <h3 className="font-bold">
                    {first ? (
                      <Link to={`/lesson/${first.id}`} className={link}>
                        {m.title}
                      </Link>
                    ) : (
                      m.title
                    )}
                  </h3>
                  {j && <StatusBadge status={j.status} />}
                  <p className="mt-1">{m.summary}</p>
                  <p className="mt-1 text-sm">
                    {m.lessons.length} {m.lessons.length === 1 ? 'lesson' : 'lessons'} · about{' '}
                    {m.estimatedMinutes} minutes
                    {j && j.lessonsDone > 0 ? ` · ${String(j.lessonsDone)} done` : ''}
                  </p>
                  {j?.reason && <p className="mt-1 text-sm">{j.reason}</p>}
                  {j?.testedOut && <p className="mt-1 text-sm">You tested out of this module.</p>}
                  {m.testOut && !j?.testedOut && j?.status !== 'complete' && (
                    <p className="mt-1 text-sm">
                      <Link to={`/test-out/${region.id}/${m.id}`} className={link}>
                        Test out of {m.title}
                      </Link>{' '}
                      ({m.testOut.length} questions)
                    </p>
                  )}
                </li>
              )
            })}
          </ol>
        )}
      </section>
      {region.link && (
        <p className="mt-6">
          <Link to={region.link.to} className={link}>
            {region.link.text}
          </Link>
        </p>
      )}
      <nav aria-label="Regions" className="mt-8 flex flex-wrap justify-between gap-4">
        {prev ? (
          <Link to={`/region/${prev.id}`} className={link}>
            ← {prev.title}
          </Link>
        ) : (
          <span />
        )}
        <Link to="/map" className={link}>
          Map of the Reach
        </Link>
        {next ? (
          <Link to={`/region/${next.id}`} className={link}>
            {next.title} →
          </Link>
        ) : (
          <span />
        )}
      </nav>
    </Page>
  )
}
