import { MDXProvider } from '@mdx-js/react'
import { lazy, Suspense, useMemo, type ComponentType } from 'react'
import { PageSkeleton } from '../shell/Skeleton'
import type { Domain } from '@/content'
import type { Check } from '@/content/checks'
import { ChecksContext } from './checks/context'
<<<<<<< HEAD
import { LessonContext } from './lesson-context'
=======
>>>>>>> origin/main
import { StepContext } from './step-context'
import { LESSON_COMPONENTS } from './components'
import { lessonLoader } from './load'

/** A lesson's MDX body with every lesson component available (E5-02). */
export function LessonBody({
  file,
  checks = [],
  step,
<<<<<<< HEAD
  domain,
}: {
  file: string
  /** The lesson's domain, for the default depth layer. */
  domain?: Domain
=======
}: {
  file: string
>>>>>>> origin/main
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
<<<<<<< HEAD
    <LessonContext value={domain ? { domain } : {}}>
      <StepContext value={step}>
        <MdxContent Body={Body} checks={checks} />
      </StepContext>
    </LessonContext>
=======
    <StepContext value={step}>
      <MdxContent Body={Body} checks={checks} />
    </StepContext>
>>>>>>> origin/main
  )
}

export function MdxContent({
  Body,
  checks = [],
}: {
  Body: ComponentType
  checks?: readonly Check[]
}) {
  return (
    <MDXProvider components={LESSON_COMPONENTS}>
      <ChecksContext value={checks}>
        <Suspense fallback={<PageSkeleton />}>
          <Body />
        </Suspense>
      </ChecksContext>
    </MDXProvider>
  )
}
