#!/usr/bin/env node
// Renders every <Diagram> in content/ (```mermaid inside it) to content/diagrams/<hash>.svg with headless
// Chromium, and removes SVGs no lesson uses any more (E5-02). Usage: npm run diagrams [-- --check]
import { readdirSync, readFileSync, rmSync, writeFileSync, mkdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { chromium } from '@playwright/test'
import { DIAGRAM_DIR, diagramHash } from '../src/content/build/diagrams.ts'

const ROOT = join(import.meta.dirname, '..')
const CONTENT = join(ROOT, 'content')
const check = process.argv.includes('--check')

const walk = (dir) =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.mdx') ? [p] : []
  })
const sources = new Map()
for (const file of walk(CONTENT))
  for (const m of readFileSync(file, 'utf8').matchAll(
    /<Diagram\b[^>]*>\s*```mermaid\n([\s\S]*?)```\s*<\/Diagram>/g,
  ))
    sources.set(diagramHash(m[1]), { source: m[1].trim(), file: relative(ROOT, file) })

mkdirSync(DIAGRAM_DIR, { recursive: true })
const existing = new Set(
  readdirSync(DIAGRAM_DIR)
    .filter((f) => f.endsWith('.svg'))
    .map((f) => f.slice(0, -4)),
)
const missing = [...sources.keys()].filter((h) => !existing.has(h))
const stale = [...existing].filter((h) => !sources.has(h))
if (check) {
  for (const h of missing)
    console.error(
      `::error::${sources.get(h).file}: diagram ${h} is not rendered; run npm run diagrams`,
    )
  for (const h of stale)
    console.error(
      `::error::content/diagrams/${h}.svg is not used by any lesson; run npm run diagrams`,
    )
  process.exit(missing.length || stale.length ? 1 : 0)
}
for (const h of stale) rmSync(join(DIAGRAM_DIR, `${h}.svg`))
if (missing.length) {
  const browser = await chromium.launch()
  const page = await browser.newPage()
  await page.setContent('<!doctype html><body></body>')
  await page.addScriptTag({ path: join(ROOT, 'node_modules/mermaid/dist/mermaid.min.js') })
  for (const h of missing) {
    const { source } = sources.get(h)
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
    writeFileSync(join(DIAGRAM_DIR, `${h}.svg`), `${svg}\n`)
    console.log(`rendered ${h} (${sources.get(h).file})`)
  }
  await browser.close()
}
console.log(
  `${String(sources.size)} diagram(s); ${String(missing.length)} rendered, ${String(stale.length)} removed`,
)
