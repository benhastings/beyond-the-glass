import { spawnSync } from 'node:child_process'
import { mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, cleanCheckout } from '../tests/repo/helpers.ts'
import { blockThirdPartyRequests, expect, expectNoA11yViolations, test } from './fixtures.ts'

// These prove the harness itself catches problems, so a green e2e run means something.
test.describe('test harness', () => {
  test('[E0-05.AC3] expectNoA11yViolations fails on a serious or critical violation', async ({
    page,
  }) => {
    // An image with no alt text is a critical violation (image-alt); a button with no name is too.
    await page.setContent(
      '<main><h1>t</h1><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw="><button></button></main>',
    )
    const failure = await expectNoA11yViolations(page).then(
      () => null,
      (e: unknown) => String(e),
    )
    expect(failure).toContain('image-alt')
    expect(failure).toContain('button-name')
  })

  test('[E0-05.AC3] expectNoA11yViolations passes an accessible page', async ({ page }) => {
    await page.setContent(
      '<html lang="en"><title>t</title><main><h1>Fine</h1><button>Go</button></main></html>',
    )
    await expectNoA11yViolations(page)
  })

  test('blockThirdPartyRequests aborts and records requests to other origins', async ({
    browser,
    baseURL,
  }) => {
    const page = await browser.newPage()
    const origin = new URL(baseURL ?? '').origin
    const blocked = await blockThirdPartyRequests(page, origin)
    // A blank page rather than the site: the container's CSP (connect-src 'self') would stop the
    // request in the browser before it ever reached the route this helper installs.
    await page.setContent('<p>harness</p>')
    await page.evaluate(async () => {
      await fetch('https://third-party.example/beacon').catch(() => undefined)
    })
    expect(blocked).toEqual(['https://third-party.example/beacon'])
    await page.close()
  })

  test('[E0-05.AC4] a failing e2e test leaves a trace and a screenshot in test-results/', ({
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'runs a nested Playwright once, in Chromium')
    test.setTimeout(90_000)
    const dir = cleanCheckout()
    try {
      symlinkSync(join(ROOT, 'node_modules'), join(dir, 'node_modules'), 'dir')
      mkdirSync(join(dir, 'e2e'), { recursive: true })
      writeFileSync(
        join(dir, 'e2e/deliberate-failure.spec.ts'),
        "import { expect, test } from './fixtures.ts'\ntest('fails', async ({ page }) => {\n  await page.setContent('<h1>here</h1>')\n  await expect(page.getByRole('heading')).toHaveText('not here', { timeout: 500 })\n})\n",
      )
      // BASE_URL skips the preview server; the nested test never navigates.
      const r = spawnSync(
        'npx',
        [
          'playwright',
          'test',
          'e2e/deliberate-failure.spec.ts',
          '--project',
          'chromium',
          '--retries',
          '0',
          '--reporter',
          'line',
        ],
        {
          cwd: dir,
          encoding: 'utf8',
          env: { ...process.env, CI: '', BASE_URL: 'http://127.0.0.1:9/' },
        },
      )
      expect(r.status, r.stdout + r.stderr).not.toBe(0)
      expect(r.stdout + r.stderr).toContain('not here')
      const files = spawnSync('find', ['test-results', '-type', 'f'], {
        cwd: dir,
        encoding: 'utf8',
      }).stdout
      expect(files).toMatch(/trace\.zip/)
      expect(files).toMatch(/test-failed-\d+\.png/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
