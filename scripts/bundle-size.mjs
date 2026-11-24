#!/usr/bin/env node
// Prints a markdown table of every file in dist/assets with its raw and gzipped size.
// In CI it's appended to the job summary. Usage: node scripts/bundle-size.mjs [distDir]
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

const dist = process.argv[2] ?? 'dist'
const dir = join(dist, 'assets')
const kb = (n) => `${(n / 1024).toFixed(1)} KB`
const rows = readdirSync(dir)
  .filter((f) => statSync(join(dir, f)).isFile())
  .map((f) => {
    const buf = readFileSync(join(dir, f))
    return { f, raw: buf.length, gz: gzipSync(buf, { level: 9 }).length }
  })
  .sort((a, b) => b.gz - a.gz)

const out = ['### Bundle size', '', '| File | Raw | Gzipped |', '|---|---:|---:|']
for (const r of rows) out.push(`| \`assets/${r.f}\` | ${kb(r.raw)} | ${kb(r.gz)} |`)
const total = rows.reduce((a, r) => a + r.gz, 0)
out.push(`| **Total** | | **${kb(total)}** |`)
console.log(out.join('\n'))
