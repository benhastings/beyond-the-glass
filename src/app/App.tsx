import { HashRouter, Route, Routes, useParams } from 'react-router'
import { useProgress } from './progress'
import { StorageNotice } from './progress/StorageNotice'

// Placeholder views until the app shell (E2-01) and region pages (E2-04) replace them. Routing lives after
// the `#` so GitHub Pages only ever serves index.html (ADR-002).

function Landing() {
  return (
    <>
      <h1 className="text-3xl font-bold">Beyond the Glass</h1>
      <p className="mt-4">For years you watched the glass. Now step through it.</p>
    </>
  )
}

function Region() {
  const { regionId = '' } = useParams()
  return <h1 className="text-3xl font-bold">Region: {regionId}</h1>
}

function NotFound() {
  return <h1 className="text-3xl font-bold">This path doesn&apos;t lead anywhere yet</h1>
}

export function AppRoutes() {
  const storageFailure = useProgress((s) => s.storageFailure)
  const dismiss = useProgress((s) => s.dismissStorageFailure)
  return (
    <>
      <main className="min-h-screen bg-ground p-8 text-ink">
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/region/:regionId" element={<Region />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <StorageNotice failure={storageFailure} onDismiss={dismiss} />
    </>
  )
}

export function App() {
  return (
    <HashRouter>
      <AppRoutes />
    </HashRouter>
  )
}
