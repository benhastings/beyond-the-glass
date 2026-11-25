import { MDXProvider } from '@mdx-js/react'
import { lazy, Suspense, useMemo, type ComponentType } from 'react'
import { PageSkeleton } from '../shell/Skeleton'
import { LESSON_COMPONENTS } from './components'
import { lessonLoader } from './load'

/** A lesson's MDX body with every lesson component available (E5-02). */
export function LessonBody({ file }: { file: string }) {
  const Body = useMemo(() => {
    const load = lessonLoader(file)
    return load ? lazy(load) : undefined
  }, [file])
  if (!Body) return null
  return <MdxContent Body={Body} />
}

export function MdxContent({ Body }: { Body: ComponentType }) {
  return (
    <MDXProvider components={LESSON_COMPONENTS}>
      <Suspense fallback={<PageSkeleton />}>
        <Body />
      </Suspense>
    </MDXProvider>
  )
}
