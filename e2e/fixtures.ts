import AxeBuilder from '@axe-core/playwright'
import { test as base, expect, type Page } from '@playwright/test'

/** axe impact levels that fail a test (E0-05.AC3). */
export const FAILING_IMPACTS = ['serious', 'critical'] as const

/**
 * Runs axe (WCAG 2.0–2.2 A and AA rules) on the page and fails on any serious or critical violation,
 * listing each rule, its impact and the offending selectors.
 */
export async function expectNoA11yViolations(page: Page): Promise<void> {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze()
  const failing = violations.filter((v) =>
    (FAILING_IMPACTS as readonly string[]).includes(v.impact ?? ''),
  )
  const report = failing.map(
    (v) =>
      `${v.id} (${String(v.impact)}): ${v.help}\n  ${v.nodes.map((n) => n.target.join(' ')).join('\n  ')}`,
  )
  expect(report, 'axe violations').toEqual([])
}

/**
 * Aborts every request to an origin other than the page's own and records it. The returned list is
 * what was blocked; the `test` fixture below fails any test that leaves it non-empty (ROADMAP §6).
 */
export async function blockThirdPartyRequests(page: Page, ownOrigin: string): Promise<string[]> {
  const blocked: string[] = []
  await page.route(
    (url) => url.origin !== ownOrigin && url.protocol !== 'data:' && url.protocol !== 'blob:',
    async (route) => {
      blocked.push(route.request().url())
      await route.abort('blockedbyclient')
    },
  )
  return blocked
}

/**
 * Every e2e test uses this `test`: third-party requests are blocked and fail the test, and any
 * uncaught page error or console error fails it too.
 */
export const test = base.extend<{ thirdPartyGuard: undefined; allowedConsoleErrors: RegExp[] }>({
  /** Console errors a test expects, e.g. the 404 a path-style link produces before redirecting. */
  allowedConsoleErrors: [[], { option: true }],
  thirdPartyGuard: [
    async ({ page, baseURL, allowedConsoleErrors }, use) => {
      const blocked = await blockThirdPartyRequests(
        page,
        new URL(baseURL ?? 'http://127.0.0.1').origin,
      )
      const errors: string[] = []
      page.on('pageerror', (e) => errors.push(e.message))
      page.on('console', (m) => {
        const text = m.text()
        if (m.type() !== 'error' || text.includes('ERR_BLOCKED_BY_CLIENT')) return
        if (!allowedConsoleErrors.some((re) => re.test(text))) errors.push(text)
      })
      await use(undefined)
      expect(blocked, 'requests to third-party origins').toEqual([])
      expect(errors, 'page and console errors').toEqual([])
    },
    { auto: true },
  ],
})

export { expect }
