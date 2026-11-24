#!/usr/bin/env node
// Lighthouse (desktop) on each route in budgets.json against a running site; fails when any category is
// under its minimum (E0-08). Usage: node scripts/lighthouse.mjs <baseURL> [--chrome <path>]
import * as chromeLauncher from 'chrome-launcher'
import lighthouse from 'lighthouse'
import desktop from 'lighthouse/core/config/desktop-config.js'
import { loadBudgets, scoreFailures } from './budgets.mjs'

export async function audit(baseURL, chromePath) {
  const { routes, minScores } = loadBudgets().lighthouse
  const chrome = await chromeLauncher.launch({
    chromePath,
    chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu'],
  })
  const results = []
  try {
    for (const route of routes) {
      const url = new URL(route, baseURL).href
      const { lhr } = await lighthouse(
        url,
        { port: chrome.port, output: 'json', logLevel: 'error' },
        desktop,
      )
      const scores = Object.fromEntries(
        Object.keys(minScores).map((c) => [c, Math.round((lhr.categories[c]?.score ?? 0) * 100)]),
      )
      const failed = Object.values(lhr.audits)
        .filter((a) => a.score !== null && a.score < 1 && a.scoreDisplayMode === 'binary')
        .map((a) => a.id)
      results.push({
        route,
        scores,
        failures: scoreFailures(scores, minScores),
        failedAudits: failed,
      })
    }
  } finally {
    await chrome.kill()
  }
  return results
}

if (import.meta.url === `file://${process.argv[1] ?? ''}`) {
  const base = process.argv[2]
  const i = process.argv.indexOf('--chrome')
  if (!base) {
    console.error('usage: node scripts/lighthouse.mjs <baseURL> [--chrome <path>]')
    process.exit(2)
  }
  const results = await audit(base, i > 0 ? process.argv[i + 1] : undefined)
  let bad = false
  for (const r of results) {
    console.log(
      `${r.route}  ${Object.entries(r.scores)
        .map(([c, s]) => `${c} ${String(s)}`)
        .join('  ')}`,
    )
    for (const f of r.failures) {
      console.error(
        `::error::${r.route} ${f} (failing audits: ${r.failedAudits.join(', ') || 'none'})`,
      )
      bad = true
    }
  }
  process.exit(bad ? 1 : 0)
}
