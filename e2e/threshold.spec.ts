import { acTest } from './ac.ts'
import { expect, expectNoA11yViolations } from './fixtures.ts'

acTest(
  'E4-02.AC3',
  'reloading mid-quiz resumes at the same question with prior answers intact',
  async ({ page }) => {
    await page.goto('./#/threshold')
    await expect(page.getByText(/There are no wrong answers/)).toBeVisible()
    await expectNoA11yViolations(page)
    await page.getByRole('button', { name: 'Begin', exact: true }).click()
    await expect(page.getByText('Question 1 of 10')).toBeFocused()
    await page.keyboard.press('Tab')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    await expect(page.getByRole('radio', { name: 'Most weeks, for routine checks' })).toBeChecked()
    await page.getByRole('button', { name: 'Next →' }).click()
    await page.getByRole('radio', { name: 'Whether a process is listening on port 8080' }).click()
    await page.getByRole('button', { name: 'Next →' }).click()
    await expect(page.getByText(/^Question 3 of \d+$/)).toBeVisible()
    await expectNoA11yViolations(page)
    await page.reload()
    await expect(page.getByText(/^Question 3 of \d+$/)).toBeVisible()
    await page.getByRole('button', { name: '← Back' }).click()
    await expect(
      page.getByRole('radio', { name: 'Whether a process is listening on port 8080' }),
    ).toBeChecked()
    await page.getByRole('button', { name: '← Back' }).click()
    await expect(page.getByRole('radio', { name: 'Most weeks, for routine checks' })).toBeChecked()
  },
)
