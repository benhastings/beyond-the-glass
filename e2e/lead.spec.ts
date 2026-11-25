import { acTest } from './ac.ts'
import { expect, expectNoA11yViolations } from './fixtures.ts'

acTest('E3-05.AC4', 'nothing pasted into the lead view is written to storage', async ({ page }) => {
  // A real code, from this browser's own progress.
  await page.goto('./#/threshold')
  await page
    .getByRole('button', { name: 'Skip the Threshold and start from the very beginning' })
    .click()
  await page.goto('./#/settings')
  await page.getByRole('button', { name: 'Show my progress code' }).click()
  const code = await page.getByRole('textbox', { name: 'Your progress code' }).inputValue()
  await page.waitForTimeout(700)
  const before = await page.evaluate<string>('JSON.stringify(Object.entries(localStorage).sort())')

  await page.goto('./#/lead')
  await page
    .getByRole('textbox', { name: 'Progress codes, one per line' })
    .fill(`${code}\nnot a code`)
  await page.getByRole('button', { name: 'Show progress' }).click()
  await expect(page.getByRole('table', { name: /Learners’ progress/ })).toBeVisible()
  await expect(page.getByText('Line 2:')).toBeVisible()
  await expectNoA11yViolations(page)
  await page.waitForTimeout(700)
  expect(await page.evaluate<string>('JSON.stringify(Object.entries(localStorage).sort())')).toBe(
    before,
  )
})
