import { useEffect } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router'
import { allLessons, findLesson, lessonCompletion, type LessonEntry } from '@/content'
import { useManifest } from '../content'
import { LessonBody } from '../lesson/LessonBody'
import { useProgress } from '../progress'
import { NotFound } from '../shell/NotFound'
import { Page } from '../shell/Page'
import { Button } from '../ui/Button'
import { Callout } from '../ui/Callout'

const link = 'underline underline-offset-4'

/**
 * `/lesson/:lessonId/:step?`: the lesson player (E5-04). One step at a time, with the step list and
 * Prev/Next; `/lesson/:id` resumes at the saved step; `/lesson/:id/done` is the completion screen.
 * Next is always enabled; finishing needs the lesson's required checks and challenges.
 */
export default function Lesson() {
  const { lessonId = '', step } = useParams()
  const manifest = useManifest()
  const lesson = findLesson(manifest, lessonId)
  const saved = useProgress((s) => s.progress.lessons[lessonId])
  const goToStep = useProgress((s) => s.goToStep)
  const setResumeAt = useProgress((s) => s.setResumeAt)
  const count = lesson?.steps.length ?? 0
  const index =
    step && /^\d+$/.test(step) ? Math.min(Math.max(Number(step), 1), Math.max(count, 1)) - 1 : 0
  useEffect(() => {
    if (lesson && step && step !== 'done') {
      goToStep(lesson.id, index)
      // Remembered for "Continue" on the Console Room (E3-04).
      setResumeAt(`/lesson/${lesson.id}/${String(index + 1)}`)
    }
  }, [lesson, step, index, goToStep, setResumeAt])
  if (!lesson) return <NotFound />
  // No step in the URL: carry on where the learner left off.
  if (step === undefined)
    return <Navigate replace to={`/lesson/${lesson.id}/${String((saved?.currentStep ?? 0) + 1)}`} />
  if (step === 'done')
    return <Done lesson={lesson} next={nextLesson(allLessons(manifest), lesson)} />
  return <Player lesson={lesson} index={index} />
}

function nextLesson(lessons: LessonEntry[], current: LessonEntry): LessonEntry | undefined {
  const completed = useProgress.getState().progress.lessons
  const after = lessons.slice(lessons.findIndex((l) => l.id === current.id) + 1)
  return after.find((l) => !completed[l.id]?.completedAt) ?? after[0]
}

function Player({ lesson, index }: { lesson: LessonEntry; index: number }) {
  const navigate = useNavigate()
  const progress = useProgress((s) => s.progress)
  const completeStep = useProgress((s) => s.completeStep)
  const completeLesson = useProgress((s) => s.completeLesson)
  const steps = lesson.steps
  const current = steps[index]
  const done = new Set(progress.lessons[lesson.id]?.completedSteps ?? [])
  const completion = lessonCompletion(lesson, {
    passedChecks: new Set(
      Object.entries(progress.checks)
        .filter(([, c]) => c.passed)
        .map(([id]) => id),
    ),
    completedChallenges: new Set(
      Object.entries(progress.challenges)
        .filter(([, c]) => c.status === 'completed')
        .map(([id]) => id),
    ),
  })
  const last = index >= steps.length - 1
  const to = (i: number) => `/lesson/${lesson.id}/${String(i + 1)}`
  const finish = () => {
    if (current) completeStep(lesson.id, current.id)
    if (!completion.complete) return
    completeLesson(lesson.id)
    void navigate(`/lesson/${lesson.id}/done`)
  }
  const prompt = (kind: string, id: string) =>
    kind === 'check'
      ? (lesson.checks.find((c) => c.id === id)?.prompt ?? id)
      : `the challenge “${id}”`
  return (
    <Page title={lesson.title} region={lesson.regionId}>
      <div className="mt-2 grid gap-1 text-sm">
        <p>
          About {lesson.estimatedMinutes} minutes · {Math.max(steps.length, 1)}{' '}
          {steps.length === 1 ? 'step' : 'steps'}
        </p>
        <details className="max-w-prose">
          <summary className="cursor-pointer">What you’ll be able to do</summary>
          <ul className="mt-1 list-disc pl-6">
            {lesson.objectives.map((o) => (
              <li key={o}>{o}</li>
            ))}
          </ul>
        </details>
      </div>
      <div className="mt-6 grid min-w-0 gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
        {steps.length > 0 && (
          <nav aria-label="Lesson steps">
            <details open className="lg:sticky lg:top-4">
              <summary className="cursor-pointer font-bold">
                Step {index + 1} of {steps.length}
              </summary>
              <ol className="mt-2 grid gap-1">
                {steps.map((s, i) => (
                  <li key={s.id}>
                    <Link
                      to={to(i)}
                      aria-current={i === index ? 'step' : undefined}
                      className={i === index ? 'font-bold' : link}
                    >
                      {i + 1}. {s.title ?? `Step ${String(i + 1)}`}
                    </Link>
                    {done.has(s.id) && (
                      <span>
                        {' '}
                        <span aria-hidden="true">✓</span>
                        <span className="sr-only">(done)</span>
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            </details>
          </nav>
        )}
        <div className="min-w-0">
          <LessonBody
            file={lesson.file}
            checks={lesson.checks}
            domain={lesson.domain}
            {...(current ? { step: current.id } : {})}
          />
          <div className="mt-8 flex flex-wrap items-center gap-3">
            {index > 0 && (
              <Link to={to(index - 1)} className={link}>
                ← Previous step
              </Link>
            )}
            {!last ? (
              <Link
                to={to(index + 1)}
                onClick={() => {
                  if (current) completeStep(lesson.id, current.id)
                }}
                className="inline-flex min-h-11 items-center rounded-md border-2 border-accent bg-accent px-4 font-bold text-accent-ink"
              >
                Next step →
              </Link>
            ) : (
              <Button variant="primary" onClick={finish}>
                Finish lesson
              </Button>
            )}
          </div>
          {last && !completion.complete && (
            <div className="mt-4" role="status">
              <Callout kind="info" title="Almost there">
                To finish, complete:
                <ul className="list-disc pl-6">
                  {completion.missing.map((m) => (
                    <li key={m.id}>{prompt(m.kind, m.id)}</li>
                  ))}
                </ul>
                You can go back to any step from the list.
              </Callout>
            </div>
          )}
        </div>
      </div>
    </Page>
  )
}

function Done({ lesson, next }: { lesson: LessonEntry; next: LessonEntry | undefined }) {
  const completed = useProgress((s) => s.progress.lessons[lesson.id]?.completedAt)
  const setResumeAt = useProgress((s) => s.setResumeAt)
  // "Continue" from the Console Room now shows this: the lesson, complete.
  useEffect(() => {
    if (completed) setResumeAt(`/lesson/${lesson.id}/done`)
  }, [completed, lesson.id, setResumeAt])
  if (!completed) return <Navigate replace to={`/lesson/${lesson.id}`} />
  return (
    <Page title={`${lesson.title}: complete`} heading={lesson.title} region={lesson.regionId}>
      <h2 className="mt-4 text-xl font-bold">Lesson complete</h2>
      <p className="mt-2">What you can do now:</p>
      <ul className="mt-1 list-disc pl-6">
        {lesson.objectives.map((o) => (
          <li key={o}>{o}</li>
        ))}
      </ul>
      <p className="mt-6 flex flex-wrap gap-4">
        {next && (
          <Link to={`/lesson/${next.id}`} className={link}>
            Next: {next.title}
          </Link>
        )}
        <Link to={`/region/${lesson.regionId}`} className={link}>
          Back to the region
        </Link>
        <Link to={`/lesson/${lesson.id}/1`} className={link}>
          Read it again
        </Link>
      </p>
    </Page>
  )
}
