import { acTest } from './ac.ts'
import { expect, test } from './fixtures.ts'

// Runs when the e2e suite targets the container image (CI's `container` job sets CONTAINER=1); a
// neutral skip elsewhere. The rest of the suite (landing, deep links, third-party check) runs too.
test.describe('container image', () => {
  test.skip(!process.env.CONTAINER, 'only against the container image')

  acTest(
    'E0-09.AC5',
    'every response carries the CSP and security headers',
    async ({ page, request }) => {
      for (const path of ['./', './healthz', './favicon.svg']) {
        const res = await request.get(path, { maxRedirects: 0 })
        const h = res.headers()
        expect(h['content-security-policy'], path).toContain("default-src 'self'")
        expect(h['content-security-policy'], path).toContain("frame-ancestors 'none'")
        expect(h['x-content-type-options'], path).toBe('nosniff')
        expect(h['referrer-policy'], path).toBe('no-referrer')
        expect(h['permissions-policy'], path).toContain('camera=()')
      }
      // The strict CSP doesn't break the app: no violations, and the landing view renders.
      const violations: string[] = []
      page.on('console', (m) => {
        if (/Content Security Policy/i.test(m.text())) violations.push(m.text())
      })
      await page.goto('./')
      await expect(page.getByRole('heading', { level: 1, name: 'Beyond the Glass' })).toBeVisible()
      expect(violations).toEqual([])
    },
  )

  acTest(
    'E0-09.AC1',
    'the Playwright smoke path passes against the container',
    async ({ page }) => {
      await page.goto('./#/region/chartroom')
      await page.reload()
      await expect(page.getByRole('heading', { level: 1, name: 'The Chartroom' })).toBeVisible()
    },
  )

  acTest(
    'E0-09.AC4',
    'deep links and hard refresh work, and /healthz answers',
    async ({ page, request }) => {
      expect((await request.get('./healthz')).status()).toBe(200)
      await page.goto('./region/chartroom')
      await expect(page).toHaveURL(/\/#\/region\/chartroom$/)
      await page.reload()
      await expect(page.getByRole('heading', { level: 1, name: 'The Chartroom' })).toBeVisible()
    },
  )
})
