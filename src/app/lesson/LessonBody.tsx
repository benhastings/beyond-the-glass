import { lazy, Suspense, useMemo } from 'react'
import type { Domain } from '@/content'
import type { Check } from '@/content/checks'
import { PageSkeleton } from '../shell/Skeleton'
import { LessonContext } from './lesson-context'
import { lessonLoader } from './load'
import { StepContext } from './step-context'

// The lesson components (and the primitives they use) load with the first lesson, not with the app.
const MdxContent = lazy(() => import('./MdxContent').then((m) => ({ default: m.MdxContent })))

/** A lesson's MDX body with every lesson component available (E5-02). */
export function LessonBody({
  file,
  checks = [],
  step,
  domain,
}: {
  file: string
  /** The lesson's domain, for the default depth layer. */
  domain?: Domain
  checks?: readonly Check[]
  /** The step to show; every step when undefined. */
  step?: string
}) {
  const Body = useMemo(() => {
    const load = lessonLoader(file)
    return load ? lazy(load) : undefined
  }, [file])
  if (!Body) return null
  return (
    <LessonContext value={domain ? { domain } : {}}>
      <StepContext value={step}>
        <Suspense fallback={<PageSkeleton />}>
          <MdxContent Body={Body} checks={checks} />
        </Suspense>
      </StepContext>
    </LessonContext>
  )
}
