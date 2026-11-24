#!/usr/bin/env node
// Fails when the initial JS in dist/ is over budgets.json's initialJsGzipKb. Usage: node scripts/check-bundle.mjs [dist]
import { initialJs, loadBudgets } from './budgets.mjs'

const dist = process.argv[2] ?? 'dist'
const limit = loadBudgets().initialJsGzipKb
const { files, gzipKb } = initialJs(dist)
for (const f of files) console.log(`  ${f.file}  ${(f.gzipBytes / 1024).toFixed(1)} KB gzipped`)
console.log(`initial JS: ${gzipKb.toFixed(1)} KB gzipped (budget ${String(limit)} KB)`)
if (!files.length) {
  console.error('no initial JS found in index.html')
  process.exit(1)
}
if (gzipKb > limit) {
  console.error(
    `::error::initial JS is ${gzipKb.toFixed(1)} KB gzipped, over the ${String(limit)} KB budget`,
  )
  process.exit(1)
}
