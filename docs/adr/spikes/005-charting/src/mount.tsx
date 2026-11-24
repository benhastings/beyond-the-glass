import type { ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
declare global { interface Window { renderMs?: number } }
// Render time = from createRoot until both series' paths (1,440 points each) are in the DOM, or the
// table for the baseline: whatever the library defers to later frames is counted.
export function mount(node: ReactNode) {
  const start = performance.now()
  createRoot(document.getElementById('root')!).render(node)
  const done = () => [...document.querySelectorAll('path')].filter((p) => (p.getAttribute('d') ?? '').length > 5000).length >= 2 || (document.querySelector('table') && !document.querySelector('svg'))
  const tick = () => { if (done()) window.renderMs = performance.now() - start; else requestAnimationFrame(tick) }
  tick()
}
