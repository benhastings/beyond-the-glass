import { expect, test } from '@playwright/test'

test('landing view renders', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  await page.goto('./')
  await expect(page.getByRole('heading', { level: 1, name: 'Beyond the Glass' })).toBeVisible()
  expect(errors).toEqual([])
})
