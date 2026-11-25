#!/usr/bin/env node
// The content style lint (E5-06): lessons (MDX), checks, challenges and the glossary. Rules and the
// lint-allow escape hatch: src/content/lint/rules.ts. Usage: npm run lint:content [-- DIR…]
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { lintMdx, lintYaml } from '../src/content/lint/rules.ts'

const ROOT = join(import.meta.dirname, '..')
const dirs = process.argv.slice(2).length ? process.argv.slice(2) : ['content', 'src/challenges']
const walk = (dir) =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    if (n === '__fixtures__' || n === 'diagrams' || n === 'node_modules') return []
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
const findings = []
let files = 0
for (const d of dirs)
  for (const p of walk(join(ROOT, d))) {
    const rel = relative(ROOT, p)
    const text = readFileSync(p, 'utf8')
    if (p.endsWith('.mdx')) findings.push(...lintMdx(rel, text))
    else if (/\.ya?ml$/.test(p)) findings.push(...lintYaml(rel, text))
    else continue
    files++
  }
for (const f of findings) console.error(`${f.file}:${String(f.line)} ${f.rule}: ${f.message}`)
console.log(`lint:content: ${String(files)} files, ${String(findings.length)} problem(s)`)
process.exit(findings.length ? 1 : 0)
