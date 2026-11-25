import { acTest } from './ac.ts'
import { expect, expectNoA11yViolations } from './fixtures.ts'

acTest('E2-06.AC2', 'settings apply immediately and persist across reloads', async ({ page }) => {
  await page.goto('./#/settings')
  await page
    .getByRole('radiogroup', { name: 'High contrast' })
    .getByRole('radio', { name: 'On' })
    .click()
  await page
    .getByRole('radiogroup', { name: 'Text size' })
    .getByRole('radio', { name: '130%' })
    .click()
  await page
    .getByRole('radiogroup', { name: 'Reduce motion' })
    .getByRole('radio', { name: 'On' })
    .click()
  // Applied at once, without a save button.
  await expect
    .poll(() => page.evaluate<string>('document.documentElement.dataset.contrast'))
    .toBe('more')
  await expect
    .poll(() => page.evaluate<string>('document.documentElement.style.fontSize'))
    .toBe('130%')
  await expect
    .poll(() => page.evaluate<string>('document.documentElement.dataset.motion'))
    .toBe('reduce')
  await page.waitForTimeout(700)
  await page.reload()
  await expect(
    page.getByRole('radiogroup', { name: 'Text size' }).getByRole('radio', { name: '130%' }),
  ).toBeChecked()
  expect(await page.evaluate<string>('document.documentElement.style.fontSize')).toBe('130%')
  expect(await page.evaluate<string>('document.documentElement.dataset.contrast')).toBe('more')
})

acTest(
  'E2-06.AC1',
  'starting over needs RESET typed, and offers a download first',
  async ({ page }) => {
    await page.goto('./#/threshold')
    await page
      .getByRole('button', { name: 'Skip the Threshold and start from the very beginning' })
      .click()
    await page.goto('./#/settings')
    await page.getByRole('button', { name: 'Start over…' }).click()
    const dialog = page.getByRole('dialog', { name: 'Start over?' })
    await expect(dialog).toBeVisible()
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      dialog.getByRole('button', { name: 'Download my progress first' }).click(),
    ])
    expect(download.suggestedFilename()).toMatch(
      /^beyond-the-glass-progress-\d{4}-\d\d-\d\d\.json$/,
    )
    const clear = dialog.getByRole('button', { name: 'Clear my progress' })
    await expect(clear).toBeDisabled()
    await dialog.getByRole('textbox', { name: 'Type RESET to confirm' }).fill('reset')
    await expect(clear).toBeDisabled()
    await dialog.getByRole('textbox', { name: 'Type RESET to confirm' }).fill('RESET')
    await clear.click()
    await expect(page.getByText('Your progress has been cleared.')).toBeVisible()
    await expect
      .poll(() =>
        page.evaluate<string>(
          'JSON.parse(localStorage.getItem("btg:progress")).state.progress.threshold.completedAt ?? "none"',
        ),
      )
      .toBe('none')
  },
)

acTest(
  'E2-06.AC3',
  'every control is labelled and axe finds nothing, including the open dialog',
  async ({ page }) => {
    await page.goto('./#/settings')
    await page.getByRole('button', { name: 'Show my progress code' }).click()
    await expect(page.getByRole('textbox', { name: 'Your progress code' })).toHaveValue(/^BTG1\./)
    await expect(page.getByRole('textbox', { name: 'Import progress' })).toBeVisible()
    await expectNoA11yViolations(page)
    await page.getByRole('button', { name: 'Start over…' }).click()
    await expectNoA11yViolations(page)
  },
)
