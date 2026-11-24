import { expect, expectNoA11yViolations, test } from './fixtures.ts'

// @smoke tests also run against the deployed site after every deploy (pages.yml).
test(
  'landing view renders with no accessibility violations',
  { tag: '@smoke' },
  async ({ page }) => {
    await page.goto('./')
    await expect(page.getByRole('heading', { level: 1, name: 'Beyond the Glass' })).toBeVisible()
    await expectNoA11yViolations(page)
  },
)
