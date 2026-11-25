import { useId, type ReactNode } from 'react'
import { useCurrentStep } from '../step-context'

/** One step of a lesson. The lesson player (E5-04) shows one at a time; outside it, they stack. */
export function Step({ id, title, children }: { id: string; title?: string; children: ReactNode }) {
  const h = useId()
  const current = useCurrentStep()
  if (current !== undefined && current !== id) return null
  return (
    <section
      data-step={id}
      aria-labelledby={title ? h : undefined}
      className="mt-6 grid min-w-0 gap-4"
    >
      {title && (
        <h2 id={h} className="text-xl font-bold">
          {title}
        </h2>
      )}
      {children}
    </section>
  )
}
