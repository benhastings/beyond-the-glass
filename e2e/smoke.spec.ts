import { expect, expectNoA11yViolations, test } from './fixtures.ts'

test('landing view renders with no accessibility violations', async ({ page }) => {
  await page.goto('./')
  await expect(page.getByRole('heading', { level: 1, name: 'Beyond the Glass' })).toBeVisible()
  await expectNoA11yViolations(page)
})
