import { expect, test } from './fixtures.ts'

// Run locally against scripts/serve-pages.mjs and, tagged @smoke, against the deployed site after every
// deploy (BASE_URL=https://<owner>.github.io/<repo>/).
test.describe('GitHub Pages hosting', { tag: '@smoke' }, () => {
  test('[E0-03.AC2] hard-refreshing a deep link loads the correct view', async ({ page }) => {
    await page.goto('./#/region/chartroom')
    const heading = page.getByRole('heading', { level: 1, name: 'Region: chartroom' })
    await expect(heading).toBeVisible()
    await page.reload()
    await expect(heading).toBeVisible()
    // A fresh tab opening the link directly, as if pasted from chat.
    const fresh = await page.context().newPage()
    await fresh.goto(page.url())
    await expect(fresh.getByRole('heading', { level: 1, name: 'Region: chartroom' })).toBeVisible()
    await fresh.close()
  })

  test.describe('old path-style links', () => {
    // The server answers an old link with 404.html and a 404 status, and the redirect probes for the
    // base path with HEAD requests; the browser logs those 404s. Nothing else may error.
    test.use({ allowedConsoleErrors: [/status of 404/] })

    test('[E0-03.AC2] an old path-style link redirects to its hash route', async ({
      page,
      baseURL,
    }) => {
      await page.goto('./region/chartroom?from=old-link')
      await expect(page.getByRole('heading', { level: 1, name: 'Region: chartroom' })).toBeVisible()
      // HashRouter reads query parameters from inside the hash, so that's where they go.
      expect(page.url()).toBe(`${String(baseURL)}#/region/chartroom?from=old-link`)
    })
  })

  test('[E0-03.AC3] the site makes zero requests to other origins', async ({ page, baseURL }) => {
    const own = new URL(String(baseURL)).origin
    const requests: string[] = []
    page.on('request', (r) => requests.push(r.url()))
    for (const route of ['./', './#/region/chartroom', './#/nowhere']) {
      await page.goto(route)
      await page.waitForLoadState('networkidle')
    }
    expect(requests.length).toBeGreaterThan(2)
    const foreign = requests.filter((u) => !u.startsWith('data:') && new URL(u).origin !== own)
    expect(foreign).toEqual([])
  })
})
