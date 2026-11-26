import { Link } from 'react-router'
import { allLessons } from '@/content'
import { CONSOLE_ROOM_DESCRIPTION, ConsoleRoomScene } from '../art/ConsoleRoomScene'
import { useManifest } from '../content'
import { useProgress } from '../progress'
import { Page } from '../shell/Page'
import { SITE_NAME } from '../shell/page-context'

const primary =
  'inline-flex min-h-11 items-center rounded-md border-2 border-accent bg-accent px-4 font-bold text-accent-ink'
const secondary = 'underline underline-offset-4'

/** What the course leaves you able to do (E2-02). */
const CAPABILITIES = [
  'Find out why a pod isn’t running, from the terminal, the way an on-call engineer would',
  'Follow a change from a Git commit, through a pipeline, to the cluster, and roll it back',
  'Read dashboards, logs and traces to find which service is slow or failing',
  'Check which cluster you’re pointed at before you change anything',
  'Bring a broken system back during a long, layered incident',
]

/**
 * `/`: the Console Room, the journey overview (E2-02). New visitors get the hook, the journey and a way
 * into the Threshold; returning visitors get "Continue" to where they left off.
 */
export default function ConsoleRoom() {
  const manifest = useManifest()
  const progress = useProgress((s) => s.progress)
  const lessons = allLessons(manifest)
  const resume = progress.resumeAt?.path
  const resumeLesson = resume
    ? lessons.find((l) => resume.startsWith(`/lesson/${l.id}`))
    : undefined
  const placed = progress.threshold.completedAt !== undefined
  const minutes = manifest.regions.reduce((n, r) => n + r.estimatedMinutes, 0)
  const regions = manifest.regions.filter((r) => r.id !== 'console-room')
  return (
    <Page title={SITE_NAME} mood="console">
      {/* The Console Room scene (E1-04): decorative, described in text for screen readers. */}
      <ConsoleRoomScene className="mt-4 block h-auto w-full max-w-xl rounded-lg" />
      <p className="sr-only">{CONSOLE_ROOM_DESCRIPTION}</p>
      <p className="mt-6 max-w-prose text-lg">
        For years you watched the glass: the dashboards, the alerts, the steady glow of the NOC. The
        systems behind it have moved into clusters, pipelines and signals. Step through, and learn
        to work on them from the inside.
      </p>
      <div className="mt-6 flex flex-wrap items-center gap-4">
        {resume && resumeLesson ? (
          <>
            <Link to={resume} className={primary}>
              Continue: {resumeLesson.title}
            </Link>
            <Link to="/map" className={secondary}>
              View the map
            </Link>
          </>
        ) : placed ? (
          <>
            <Link to="/map" className={primary}>
              View the map
            </Link>
            <Link to="/threshold/results" className={secondary}>
              Your trail
            </Link>
          </>
        ) : (
          <>
            <Link to="/threshold" className={primary}>
              Step up to the Threshold
            </Link>
            <Link to="/map" className={secondary}>
              View the map
            </Link>
          </>
        )}
      </div>

      <section aria-labelledby="journey" className="mt-10 max-w-prose">
        <h2 id="journey" className="text-xl font-bold">
          The journey
        </h2>
        <ol className="mt-2 grid gap-2">
          {regions.map((r) => (
            <li key={r.id}>
              <Link to={`/region/${r.id}`} className="font-bold underline underline-offset-4">
                {r.title}
              </Link>
              : {r.summary}
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="by-the-end" className="mt-8 max-w-prose">
        <h2 id="by-the-end" className="text-xl font-bold">
          By the end you’ll be able to…
        </h2>
        <ul className="mt-2 list-disc pl-6">
          {CAPABILITIES.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </section>

      <p className="mt-8 max-w-prose">
        {minutes > 0
          ? `The whole journey takes about ${String(Math.round(minutes / 60))} hours, at your own pace.`
          : 'Go at your own pace: there are no deadlines and no scores.'}{' '}
        Your progress stays in this browser; nothing is sent anywhere.
      </p>
    </Page>
  )
}
