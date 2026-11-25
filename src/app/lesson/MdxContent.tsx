import { MDXProvider } from '@mdx-js/react'
import { Suspense, type ComponentType } from 'react'
import type { Check } from '@/content/checks'
import { PageSkeleton } from '../shell/Skeleton'
import { ChecksContext } from './checks/context'
import { LESSON_COMPONENTS } from './components'

/** MDX with every lesson component available (E5-02). Its own chunk, loaded with the first lesson. */
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
