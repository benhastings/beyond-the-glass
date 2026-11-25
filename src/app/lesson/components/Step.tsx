import { useId, type ReactNode } from 'react'

/** One step of a lesson. The lesson player (E5-04) shows one at a time; outside it, they stack. */
export function Step({ id, title, children }: { id: string; title?: string; children: ReactNode }) {
  const h = useId()
  return (
    <section data-step={id} aria-labelledby={title ? h : undefined} className="mt-6 grid gap-4">
      {title && (
        <h2 id={h} className="text-xl font-bold">
          {title}
        </h2>
      )}
      {children}
    </section>
  )
}
