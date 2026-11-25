import { useEffect, useRef, useState } from 'react'
import type { PromptState } from '@/sim/commands'

/**
 * The terminal prompt's "where am I": context and namespace. A production context is marked as a
 * warning in words and an icon, never colour alone. When the context or namespace changes, a polite
 * live region says so (E6-12.AC1); the first render stays quiet.
 */
export function ContextIndicator({ state }: { state: PromptState }) {
  const [message, setMessage] = useState('')
  const previous = useRef<string | null>(null)
  const key = `${state.context}/${state.namespace}`
  useEffect(() => {
    if (previous.current !== null && previous.current !== key)
      setMessage(
        `Context is now ${state.context}${state.prod ? ', a production cluster' : ''}, namespace ${state.namespace}.`,
      )
    previous.current = key
  }, [key, state.context, state.namespace, state.prod])
  return (
    <div className="flex flex-wrap items-center gap-2 font-mono text-sm">
      <span
        className={
          state.prod
            ? 'rounded-sm border-2 border-term-warn px-1.5 text-term-warn'
            : 'text-term-prompt'
        }
      >
        {state.prod && <span aria-hidden="true">▲ </span>}
        {state.context}
        {state.prod && <span className="ml-1 font-bold">(production)</span>}
      </span>
      <span aria-hidden="true" className="text-term-ink-muted">
        ▸
      </span>
      <span className="text-term-ink">{state.namespace}</span>
      <span role="status" aria-live="polite" className="sr-only">
        {message}
      </span>
    </div>
  )
}
