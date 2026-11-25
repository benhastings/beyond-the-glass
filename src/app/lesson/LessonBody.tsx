import { MDXProvider } from '@mdx-js/react'
import { lazy, Suspense, useMemo, type ComponentType } from 'react'
import { PageSkeleton } from '../shell/Skeleton'
import type { Check } from '@/content/checks'
import { ChecksContext } from './checks/context'
import { LESSON_COMPONENTS } from './components'
import { lessonLoader } from './load'

/** A lesson's MDX body with every lesson component available (E5-02). */
export function LessonBody({ file, checks = [] }: { file: string; checks?: readonly Check[] }) {
  const Body = useMemo(() => {
    const load = lessonLoader(file)
    return load ? lazy(load) : undefined
  }, [file])
  if (!Body) return null
  return <MdxContent Body={Body} checks={checks} />
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
