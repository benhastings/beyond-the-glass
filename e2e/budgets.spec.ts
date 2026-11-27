import { spawn, type ChildProcess } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from '@playwright/test'
// @ts-expect-error -- plain ESM script without type declarations
import * as lh from '../scripts/lighthouse.mjs'
import { expect, test } from './fixtures.ts'

interface Result {
  route: string
  scores: Record<string, number>
  failures: string[]
  failedAudits: string[]
}
const { audit } = lh as { audit: (base: string, chromePath?: string) => Promise<Result[]> }

// Real Lighthouse runs, once, in Chromium (Lighthouse drives its own Chrome; Playwright's build).
test.describe('Lighthouse budgets', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Lighthouse runs once, with Chromium')
  // Eight routes, one Lighthouse run each.
  test.setTimeout(400_000)

  test('[E0-08.AC1] [E11-02.AC1] every main route, including the war room, meets the Lighthouse minimums', async ({
    baseURL,
  }) => {
    const results = await audit(String(baseURL), chromium.executablePath())
    console.log(results.map((r) => `${r.route} ${JSON.stringify(r.scores)}`).join('\n'))
    expect(results.map((r) => r.route)).toEqual(
      expect.arrayContaining(['./', './#/map', './#/lesson/your-first-look', './#/stormwatch']),
    )
    for (const r of results)
      expect(r.failures, `${r.route}: ${r.failedAudits.join(', ')}`).toEqual([])
  })

  test('[E0-08.AC1] the same audit fails a page below the accessibility minimum', async () => {
    // A scratch site with known accessibility failures: no lang, an unlabelled image and button.
    const dist = mkdtempSync(join(tmpdir(), 'btg-bad-'))
    mkdirSync(join(dist, 'assets'))
    writeFileSync(join(dist, 'index.html'), '<title>x</title><img src="data:,"><button></button>')
    writeFileSync(join(dist, '404.html'), 'missing')
    let server: ChildProcess | undefined
    try {
      server = spawn('node', ['scripts/serve-pages.mjs', '--port', '4291', '--dir', dist])
      await new Promise((r) => setTimeout(r, 500))
      const results = await audit(
        'http://127.0.0.1:4291/beyond-the-glass/',
        chromium.executablePath(),
      )
      expect(results[0]?.failures.some((f) => f.startsWith('accessibility:'))).toBe(true)
    } finally {
      server?.kill()
      rmSync(dist, { recursive: true, force: true })
    }
  })
})
