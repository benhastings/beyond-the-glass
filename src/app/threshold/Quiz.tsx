import { useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import {
  displayOrder,
  LEVEL_NAMES,
  levelsOf,
  quizLength,
  score,
  selectItems,
  wayfarerEverywhere,
  type Answers,
} from '@/placement'
import { useProgress } from '../progress'
import { Button } from '../ui/Button'
import { RadioGroup } from '../ui/RadioGroup'
import { BANK } from './bank'

/** Stores levels as the progress store's level names. */
const toPlacement = (levels: ReturnType<typeof levelsOf>) =>
  Object.fromEntries(Object.entries(levels).map(([d, l]) => [d, LEVEL_NAMES[l]]))

/**
 * The Threshold quiz (E4-02): intro, one question per screen, a review of the answers, then results.
 * The question number is in the URL (`?q=4`), so a reload stays put; answers save as they're chosen.
 * No timer, no countdown, no score: the answers only choose a starting trail.
 */
export function Quiz() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const saved = useProgress((s) => s.progress.threshold.answers)
  const record = useProgress((s) => s.recordThresholdAnswer)
  const complete = useProgress((s) => s.completeThreshold)
  const answers: Answers = Object.fromEntries(
    Object.entries(saved).filter((e): e is [string, string] => typeof e[1] === 'string'),
  )
  const items = selectItems(BANK, answers)
  const total = quizLength(BANK, answers)
  const step = params.get('q')
  const heading = useRef<HTMLHeadingElement & HTMLParagraphElement>(null)
  // Each new question (or the review) takes focus, so keyboard and screen-reader users start at its top.
  // (After the page shell's own focus move to the h1, which runs on every navigation.)
  useEffect(() => {
    if (step === null) return
    const id = requestAnimationFrame(() => heading.current?.focus())
    return () => {
      cancelAnimationFrame(id)
    }
  }, [step])
  const go = (q: string | undefined) => {
    setParams(q === undefined ? {} : { q })
  }
  const finish = (levels: ReturnType<typeof levelsOf>) => {
    complete(toPlacement(levels))
    void navigate('/threshold/results')
  }
  const answered = items.filter((i) => answers[i.id] !== undefined).length
  // The glass brightens as the learner answers (decoration only).
  const glow = (
    <div
      aria-hidden="true"
      className="mx-auto my-6 h-24 w-40 rounded-md border-4 border-line bg-accent transition-opacity duration-500"
      style={{ opacity: 0.15 + 0.85 * (answered / Math.max(total, 1)) }}
    />
  )

  if (step === null) {
    const resume = Object.keys(answers).length > 0
    return (
      <div className="max-w-prose">
        {glow}
        <p className="mt-4">{BANK.intro.body}</p>
        <p className="mt-2">{BANK.intro.time}</p>
        <p className="mt-2">{BANK.intro.privacy}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button
            variant="primary"
            onClick={() => {
              const next = items.findIndex((i) => answers[i.id] === undefined)
              go(next < 0 ? 'review' : String(next + 1))
            }}
          >
            {resume ? 'Carry on where you left off' : 'Begin'}
          </Button>
          <Button
            onClick={() => {
              finish(levelsOf(wayfarerEverywhere()))
            }}
          >
            Skip the Threshold and start from the very beginning
          </Button>
        </div>
      </div>
    )
  }

  if (step === 'review' || Number(step) > items.length) {
    const pending = items.find((i) => answers[i.id] === undefined)
    return (
      <div className="max-w-prose">
        {glow}
        <h2 ref={heading} tabIndex={-1} className="text-xl font-bold outline-none">
          Reviewing your answers
        </h2>
        <ol className="mt-4 grid gap-3">
          {items.map((it, i) => (
            <li key={it.id}>
              <p className="font-bold">{it.stem}</p>
              <p>
                {it.options.find((o) => o.id === answers[it.id])?.text ?? 'Not answered yet'}{' '}
                <Button
                  variant="ghost"
                  onClick={() => {
                    go(String(i + 1))
                  }}
                  aria-label={`Change your answer to: ${it.stem}`}
                >
                  Change
                </Button>
              </p>
            </li>
          ))}
        </ol>
        <div className="mt-6">
          {pending ? (
            <Button
              variant="primary"
              onClick={() => {
                go(String(items.indexOf(pending) + 1))
              }}
            >
              Answer the remaining questions
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={() => {
                finish(levelsOf(score(BANK, answers)))
              }}
            >
              See your trail
            </Button>
          )}
        </div>
      </div>
    )
  }

  const index = Math.max(1, Number(step) || 1) - 1
  const item = items[index]
  if (!item) return null
  const value = answers[item.id]
  return (
    <div className="max-w-prose">
      {glow}
      <p ref={heading} tabIndex={-1} className="text-sm outline-none">
        Question {index + 1} of {total}
      </p>
      <div className="mt-2">
        <RadioGroup
          key={item.id}
          name={item.id}
          legend={<span className="text-lg font-bold">{item.stem}</span>}
          options={displayOrder(item).map((o) => ({ value: o.id, label: o.text }))}
          {...(value !== undefined ? { value } : {})}
          onValueChange={(v) => {
            record(item.id, v)
          }}
        />
      </div>
      <div className="mt-6 flex flex-wrap gap-3">
        <Button
          onClick={() => {
            go(index === 0 ? undefined : String(index))
          }}
        >
          ← Back
        </Button>
        <Button
          variant="primary"
          disabled={value === undefined}
          onClick={() => {
            // The next question, now that this answer may have decided which ones follow.
            const fresh = useProgress.getState().progress.threshold.answers as Answers
            const after = selectItems(BANK, fresh)
            go(index + 1 >= after.length ? 'review' : String(index + 2))
          }}
        >
          Next →
        </Button>
      </div>
    </div>
  )
}
