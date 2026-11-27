import { useId, useState } from 'react'
import {
  NOTE_SECTIONS,
  RUBRIC,
  reviewNote,
  type IncidentNote as Note,
  type Review,
} from '@/content/incidentNote'
import { Button } from '../../ui/Button'
import { cx, focusRing } from '../../ui/styles'

/**
 * `<IncidentNote />` (E9-11): write a structured incident note (impact, timeline, evidence, hypothesis,
 * next step) and have it reviewed against the rubric. Feedback says what each part has, and what's worth
 * adding; never a score.
 */
export function IncidentNote({ example }: { example?: boolean }) {
  const id = useId()
  const [note, setNote] = useState<Note>(
    () => Object.fromEntries(NOTE_SECTIONS.map((s) => [s, ''])) as Note,
  )
  const [review, setReview] = useState<Review[]>()
  const metAll = review?.every((r) => r.met) ?? false
  return (
    <section
      aria-labelledby={`${id}-title`}
      className="grid gap-4 rounded-md border border-line bg-raised p-4"
    >
      <h3 id={`${id}-title`} className="text-lg font-bold">
        Your incident note
      </h3>
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          setReview(reviewNote(note))
        }}
      >
        {RUBRIC.map((c) => (
          <label key={c.section} className="grid gap-1">
            <span className="font-bold">
              {c.label}: <span className="font-normal">{c.prompt}</span>
            </span>
            <textarea
              className={cx('min-h-16 rounded-md border border-line bg-surface p-2', focusRing)}
              value={note[c.section]}
              onChange={(e) => {
                setNote((n) => ({ ...n, [c.section]: e.target.value }))
              }}
            />
          </label>
        ))}
        <div>
          <Button type="submit" variant="primary">
            Review my note
          </Button>
        </div>
      </form>
      {review && (
        <div role="status" className="grid gap-2">
          <p className="font-bold">
            {metAll
              ? 'Every part is there. That note would help whoever reads it next.'
              : 'Here’s what your note has, and what’s worth adding:'}
          </p>
          <ul className="grid gap-2">
            {review.map((r) => (
              <li key={r.section} className="flex gap-2">
                <span aria-hidden="true">{r.met ? '✓' : '○'}</span>
                <span>
                  <strong>{r.label}</strong>
                  {r.met ? ': there.' : `: ${r.tip}`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {example && (
        <details>
          <summary className={cx('cursor-pointer font-bold', focusRing)}>An example note</summary>
          <dl className="mt-2 grid gap-1">
            <dt className="font-bold">Impact</dt>
            <dd>About 8% of sends fail with 500s; every sender is affected some of the time.</dd>
            <dt className="font-bold">Timeline</dt>
            <dd>
              20:45 ledger 4.3.0 synced; 20:46 errors start; 20:52 paged; 20:55 investigating.
            </dd>
            <dt className="font-bold">Evidence</dt>
            <dd>
              Service Overview: ravenpost-api error rate up from 20:46. Failing traces end in the
              api. Argo CD history: sync at 20:45.
            </dd>
            <dt className="font-bold">Hypothesis</dt>
            <dd>
              Likely the 20:45 release, because errors began a minute after it and nothing else
              changed.
            </dd>
            <dt className="font-bold">Next step</dt>
            <dd>I’m reverting the release through a merge request; Sam watches the error rate.</dd>
          </dl>
        </details>
      )}
    </section>
  )
}
