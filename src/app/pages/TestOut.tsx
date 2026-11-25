import { useId, useState } from 'react'
import { Link, useParams } from 'react-router'
import { findRegion } from '@/content'
import { gradeTestOut, stableShuffle, TEST_OUT_PASS } from '@/content/checks'
import { useManifest } from '../content'
import { Matching } from '../lesson/checks/Matching'
import { MultipleSelect } from '../lesson/checks/MultipleSelect'
import { Ordering } from '../lesson/checks/Ordering'
import { SingleChoice } from '../lesson/checks/SingleChoice'
import { SpotTheBug } from '../lesson/checks/SpotTheBug'
import { useProgress } from '../progress'
import { NotFound } from '../shell/NotFound'
import { Page } from '../shell/Page'
import { Button } from '../ui/Button'

const link = 'underline underline-offset-4'

/**
 * `/test-out/:regionId/:moduleId` (E4-05): answer the module's 3–5 questions; 80% right marks it tested
 * out (it counts toward completion). Otherwise it says which steps to review, with links to them.
 */
export default function TestOut() {
  const { regionId = '', moduleId = '' } = useParams()
  const manifest = useManifest()
  const region = findRegion(manifest, regionId)
  const mod = region?.modules.find((m) => m.id === moduleId)
  const testOut = useProgress((s) => s.testOutModule)
  const already = useProgress((s) => s.progress.testedOut?.[`${regionId}/${moduleId}`])
  // Ordering questions start shuffled; the rest start unanswered.
  const [answers, setAnswers] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(
      (mod?.testOut ?? []).flatMap((c) =>
        c.type === 'ordering'
          ? [
              [
                c.id,
                stableShuffle(
                  c.id,
                  c.items.map((i) => i.id),
                ),
              ],
            ]
          : [],
      ),
    ),
  )
  const [result, setResult] = useState<ReturnType<typeof gradeTestOut>>()
  const id = useId()
  if (!region || !mod?.testOut) return <NotFound />
  const checks = mod.testOut
  const stepLink = (lesson: string, step: string) => {
    const l = mod.lessons.find((x) => x.id === lesson)
    const i = l ? l.steps.findIndex((s) => s.id === step) : -1
    return {
      to: `/lesson/${lesson}/${String(i + 1)}`,
      title: l?.steps[i]?.title ?? step,
      lesson: l?.title ?? lesson,
    }
  }
  return (
    <Page title={`Test out: ${mod.title}`} region={region.id}>
      <p className="mt-4 max-w-prose">
        Already know this? Answer these {checks.length} questions. Get{' '}
        {Math.round(TEST_OUT_PASS * 100)}% right and the module counts as done; you can still open
        its lessons at any time. There’s no limit on tries.
      </p>
      {already && <p className="mt-2 font-bold">You’ve tested out of this module.</p>}
      <form
        className="mt-6 grid max-w-prose gap-6"
        onSubmit={(e) => {
          e.preventDefault()
          const r = gradeTestOut(checks, answers)
          setResult(r)
          if (r.passed) testOut(`${region.id}/${mod.id}`)
        }}
      >
        {checks.map((c, n) => {
          const props = {
            value: answers[c.id] ?? [],
            onChange: (v: string[]) => {
              setAnswers((a) => ({ ...a, [c.id]: v }))
            },
            idBase: `${id}-${c.id}`,
          }
          return (
            <fieldset key={c.id} className="grid gap-2 rounded-md border border-line p-3">
              <legend className="px-1 font-bold">
                {n + 1}. {c.prompt}
              </legend>
              {c.type === 'single' && <SingleChoice check={c} {...props} />}
              {c.type === 'multiple' && <MultipleSelect check={c} {...props} />}
              {c.type === 'ordering' && <Ordering check={c} {...props} />}
              {c.type === 'matching' && <Matching check={c} {...props} />}
              {c.type === 'spot-the-bug' && <SpotTheBug check={c} {...props} />}
            </fieldset>
          )
        })}
        <div>
          <Button type="submit" variant="primary">
            Check my answers
          </Button>
        </div>
      </form>
      <div role="status" aria-live="polite" className="mt-6 max-w-prose">
        {result &&
          (result.passed ? (
            <p>
              <span className="font-bold">
                {result.right} of {result.total} right: you’ve tested out of {mod.title}.
              </span>{' '}
              <Link to={`/region/${region.id}`} className={link}>
                Back to {region.title}
              </Link>
            </p>
          ) : (
            <>
              <p className="font-bold">
                {result.right} of {result.total} right. Worth a look before you test out:
              </p>
              <ul className="mt-2 list-disc pl-6">
                {result.review.map((c) => {
                  const s = stepLink(c.review.lesson, c.review.step)
                  return (
                    <li key={c.id}>
                      {c.prompt}{' '}
                      <Link to={s.to} className={link}>
                        Review “{s.title}” in {s.lesson}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </>
          ))}
      </div>
    </Page>
  )
}
