// Budget checks shared by the CLI scripts and the tests (E0-08). Limits come from budgets.json only.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

export function loadBudgets(root = process.cwd()) {
  return JSON.parse(readFileSync(join(root, 'budgets.json'), 'utf8'))
}

/**
 * The JS a first visit downloads before anything else: index.html's module scripts plus every
 * <link rel="modulepreload">. Lazily imported chunks (code-split tools) don't count.
 */
export function initialJs(distDir) {
  const html = readFileSync(join(distDir, 'index.html'), 'utf8')
  const refs = [
    ...html.matchAll(/<script[^>]*type="module"[^>]*src="([^"]+)"/g),
    ...html.matchAll(/<link[^>]*rel="modulepreload"[^>]*href="([^"]+)"/g),
  ].map((m) => m[1].replace(/^\.\//, ''))
  const files = [...new Set(refs)].map((f) => {
    const buf = readFileSync(join(distDir, f))
    return { file: f, gzipBytes: gzipSync(buf, { level: 9 }).length }
  })
  return { files, gzipKb: files.reduce((n, f) => n + f.gzipBytes, 0) / 1024 }
}

/** Lighthouse category scores, as percentages, below their minimums, as messages. Empty means within budget. */
export function scoreFailures(scores, minScores) {
  return Object.entries(minScores)
    .filter(([cat, min]) => !(typeof scores[cat] === 'number' && scores[cat] >= min))
    .map(([cat, min]) => `${cat}: ${String(scores[cat] ?? 'missing')} < ${String(min)}`)
}
