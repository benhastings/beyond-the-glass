import { useParams } from 'react-router'
import { findLesson } from '@/content'
import { useManifest } from '../content'
import { NotFound } from '../shell/NotFound'
import { Page } from '../shell/Page'

/** `/lesson/:lessonId/:step?` (the lesson player, E5-04). Unknown lessons get the 404 view. */
export default function Lesson() {
  const { lessonId = '', step } = useParams()
  const lesson = findLesson(useManifest(), lessonId)
  if (!lesson) return <NotFound />
  const index = Math.max(0, Math.min(Number(step ?? 1) - 1 || 0, lesson.steps.length - 1))
  return (
    <Page title={lesson.title} region={lesson.regionId}>
      {lesson.steps.length > 0 && (
        <p className="mt-4">
          Step {index + 1} of {lesson.steps.length}
        </p>
      )}
    </Page>
  )
}
