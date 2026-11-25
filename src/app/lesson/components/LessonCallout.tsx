import type { ReactNode } from 'react'
import { Callout } from '../../ui/Callout'

/** `<Callout kind="info|warn|habit|eli5">` in a lesson. */
export function LessonCallout({
  kind = 'info',
  title,
  children,
}: {
  kind?: 'info' | 'warn' | 'habit' | 'eli5'
  title?: string
  children: ReactNode
}) {
  return (
    <Callout kind={kind} {...(title ? { title } : {})}>
      {children}
    </Callout>
  )
}
