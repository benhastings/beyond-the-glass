import { createHashRouter, RouterProvider } from 'react-router'
import { routes } from './routes'

// Hash routing, so GitHub Pages only ever serves index.html (ADR-002). A data router gives back/forward
// scroll restoration.
const router = createHashRouter(routes)

export function App() {
  return <RouterProvider router={router} />
}
