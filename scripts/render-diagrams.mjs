#!/usr/bin/env node
// Renders Mermaid diagrams to SVG with headless Chromium, ahead of time, and removes SVGs nothing uses:
// - every <Diagram> in content/ (```mermaid inside it) → content/diagrams/<hash>.svg (E5-02)
// - every ```mermaid block in docs/sim/ → docs/diagrams/<hash>.svg, which the doc must link to (E10-01)
// Usage: npm run diagrams [-- --check]
import { readdirSync, readFileSync, rmSync, writeFileSync, mkdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { chromium } from '@playwright/test'
import { DIAGRAM_DIR, diagramHash } from '../src/content/build/diagrams.ts'

const ROOT = join(import.meta.dirname, '..')
const check = process.argv.includes('--check')
const walk = (dir, ext) =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? walk(p, ext) : p.endsWith(ext) ? [p] : []
  })

const TARGETS = [
  {
    name: 'content',
    dir: DIAGRAM_DIR,
    files: walk(join(ROOT, 'content'), '.mdx'),
    pattern: /<Diagram\b[^>]*>\s*```mermaid\n([\s\S]*?)```\s*<\/Diagram>/g,
    unused: 'is not used by any lesson',
  },
  {
    name: 'docs',
    dir: join(ROOT, 'docs/diagrams'),
    // The simulator's docs, where the on-call handbook lives (docs/sim/ravenpost.md).
    files: walk(join(ROOT, 'docs/sim'), '.md'),
    pattern: /```mermaid\n([\s\S]*?)```/g,
    unused: 'is not used by any doc',
    // On GitHub the source block shows the diagram; the SVG link is for everywhere else (and printing).
    linked: true,
  },
]

let failed = false
let browser
for (const t of TARGETS) {
  const sources = new Map()
  for (const file of t.files)
    for (const m of readFileSync(file, 'utf8').matchAll(t.pattern))
      sources.set(diagramHash(m[1]), { source: m[1].trim(), file })
  mkdirSync(t.dir, { recursive: true })
  const existing = new Set(
    readdirSync(t.dir)
      .filter((f) => f.endsWith('.svg'))
      .map((f) => f.slice(0, -4)),
  )
  const missing = [...sources.keys()].filter((h) => !existing.has(h))
  const stale = [...existing].filter((h) => !sources.has(h))
  const unlinked = t.linked
    ? [...sources].filter(([h, s]) => !readFileSync(s.file, 'utf8').includes(`diagrams/${h}.svg`))
    : []
  if (check) {
    for (const h of missing)
      console.error(
        `::error::${relative(ROOT, sources.get(h).file)}: diagram ${h} is not rendered; run npm run diagrams`,
      )
    for (const h of stale)
      console.error(
        `::error::${relative(ROOT, join(t.dir, `${h}.svg`))} ${t.unused}; run npm run diagrams`,
      )
    for (const [h, s] of unlinked)
      console.error(
        `::error::${relative(ROOT, s.file)}: link the rendered diagram, e.g. ![…](../diagrams/${h}.svg)`,
      )
    if (missing.length || stale.length || unlinked.length) failed = true
    continue
  }
  for (const h of stale) rmSync(join(t.dir, `${h}.svg`))
  if (missing.length) {
    browser ??= await chromium.launch()
    const page = await browser.newPage()
    await page.setContent('<!doctype html><body></body>')
    await page.addScriptTag({ path: join(ROOT, 'node_modules/mermaid/dist/mermaid.min.js') })
    for (const h of missing) {
      const { source, file } = sources.get(h)
      const svg = await page.evaluate(
        async ([id, src]) => {
          // Theme colours come from CSS variables in the app, so the SVG stays neutral here.
          window.mermaid.initialize({
            startOnLoad: false,
            securityLevel: 'strict',
            theme: 'neutral',
            htmlLabels: false,
            flowchart: { htmlLabels: false },
          })
          return (await window.mermaid.render(id, src)).svg
        },
        [`d${h}`, source],
      )
      writeFileSync(join(t.dir, `${h}.svg`), `${svg}\n`)
      console.log(`rendered ${h} (${relative(ROOT, file)})`)
    }
    await page.close()
  }
  for (const [h, s] of unlinked)
    console.warn(`${relative(ROOT, s.file)}: link the rendered diagram: ![…](../diagrams/${h}.svg)`)
  console.log(
    `${t.name}: ${String(sources.size)} diagram(s); ${String(missing.length)} rendered, ${String(stale.length)} removed`,
  )
}
await browser?.close()
if (check) process.exit(failed ? 1 : 0)
