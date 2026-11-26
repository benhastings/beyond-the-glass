import { lazy, Suspense } from 'react'

// Loaded only when a lesson shows it.
const OtelPipeline = lazy(() => import('../../o11y/otel/OtelPipeline'))

/** `<OtelPipeline />`: the interactive OpenTelemetry pipeline explainer (E8-06). */
export function LessonOtelPipeline() {
  return (
    <Suspense fallback={<p className="text-sm">Loading the pipeline…</p>}>
      <OtelPipeline />
    </Suspense>
  )
}
