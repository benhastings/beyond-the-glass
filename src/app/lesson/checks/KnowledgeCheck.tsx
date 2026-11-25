import { useId, useState } from 'react'
import { grade, stableShuffle, type Check } from '@/content/checks'
import { useProgress } from '../../progress'
import { Button } from '../../ui/Button'
import { Matching } from './Matching'
import { MultipleSelect } from './MultipleSelect'
import { Ordering } from './Ordering'
import { SingleChoice } from './SingleChoice'
import { SpotTheBug } from './SpotTheBug'

/** The answer a check starts from: nothing chosen, or (for ordering) the items shuffled. */
function initial(check: Check): string[] {
  return check.type === 'ordering'
    ? stableShuffle(
        check.id,
        check.items.map((i) => i.id),
      )
    : []
}

/**
 * One knowledge check (E5-03): the question, its input, a Check button, feedback announced in a polite
 * live region (AC3), the explanation once passed, and the result saved in progress. Retries are unlimited.
 */
export function KnowledgeCheck({ check }: { check: Check }) {
  const id = useId()
  const record = useProgress((s) => s.recordCheckAttempt)
  const saved = useProgress((s) => s.progress.checks[check.id])
  const [value, setValue] = useState<string[]>(() => {
    const last = saved?.lastAnswer
    return last === undefined ? initial(check) : typeof last === 'string' ? [last] : [...last]
  })
  const [result, setResult] = useState<ReturnType<typeof grade> | undefined>()
  const passed = result?.passed ?? saved?.passed ?? false
  const props = { value, onChange: setValue, idBase: id }
  const submit = () => {
    const g = grade(check, value)
    setResult(g)
    record(
      check.id,
      check.type === 'single' || check.type === 'spot-the-bug' ? (value[0] ?? '') : value,
      g.passed,
    )
  }
  return (
    <section
      aria-labelledby={`${id}-q`}
      className="grid min-w-0 gap-3 rounded-md border border-line bg-raised p-4"
    >
      <h3 id={`${id}-q`} className="font-bold">
        <span className="sr-only">Knowledge check: </span>
        {check.prompt}
      </h3>
      {check.type === 'single' && <SingleChoice check={check} {...props} />}
      {check.type === 'multiple' && <MultipleSelect check={check} {...props} />}
      {check.type === 'ordering' && <Ordering check={check} {...props} />}
      {check.type === 'matching' && <Matching check={check} {...props} />}
      {check.type === 'spot-the-bug' && <SpotTheBug check={check} {...props} />}
      <div>
        <Button variant="primary" onClick={submit}>
          Check my answer
        </Button>
      </div>
      <div role="status" aria-live="polite" className="grid gap-1">
        {result && (
          <>
            <p className="font-bold">{result.passed ? '✓ Correct.' : 'Not yet.'}</p>
            {result.feedback.map((f) => (
              <p key={f}>{f}</p>
            ))}
          </>
        )}
      </div>
      {passed && (
        <p>
          <span className="font-bold">Why: </span>
          {check.explanation}
        </p>
      )}
    </section>
  )
}
