import { acTest } from './ac.ts'
import { expect, expectNoA11yViolations } from './fixtures.ts'

acTest(
  ['E7-02.AC1', 'E7-02.AC2'],
  'the pipeline view works by keyboard, has a list alternative, and passes axe with a log open',
  async ({ page }) => {
    await page.goto('./#/kitchen-sink')
    const card = page.locator('#pipeline')
    const select = card.getByRole('combobox', { name: 'Pipeline' })
    const option = await select.locator('option', { hasText: 'Tidy routes' }).getAttribute('value')
    await select.selectOption(option ?? '')
    await expect(
      card.getByRole('heading', { level: 3, name: /Pipeline #\d+ .*Failed/ }),
    ).toBeVisible()
    // Graph: open the failed job's log from the keyboard; focus moves to it.
    await card.getByRole('button', { name: /unit-tests/ }).focus()
    await page.keyboard.press('Enter')
    const log = card.getByRole('region', { name: 'Log for unit-tests' })
    await expect(log).toBeFocused()
    await expect(log).toContainText('AssertionError: expected 500 to be 404')
    await expect(log).toContainText('ERROR: Job failed')
    await expectNoA11yViolations(page)
    // Sections fold and unfold from the keyboard.
    const prepare = log.locator('summary', { hasText: 'Preparing the' })
    await prepare.focus()
    await page.keyboard.press('Enter')
    await expect(log.getByText('Running with gitlab-runner')).toBeVisible()
    // The list view: the same jobs, with words beside every icon.
    await card.getByRole('tab', { name: 'Graph' }).focus()
    await page.keyboard.press('ArrowRight')
    const table = card.getByRole('table')
    await expect(table.getByRole('row')).toHaveCount(7)
    await expect(table.getByRole('row', { name: /image-scan/ })).toContainText('Skipped')
    await table.getByRole('button', { name: 'View log for lint' }).click()
    await expect(card.getByRole('region', { name: 'Log for lint' })).toBeFocused()
    await expectNoA11yViolations(page)
  },
)
