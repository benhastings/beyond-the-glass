import { acTest } from './ac.ts'
import { expect, expectNoA11yViolations } from './fixtures.ts'

acTest(
  ['E8-04.AC2', 'E8-04.AC3'],
  'logs: walk the lines by keyboard, open a line’s trace at its span, and come back to its logs',
  async ({ page }) => {
    await page.goto('./#/kitchen-sink')
    const card = page.locator('#workspace')
    await card.getByRole('tab', { name: 'Dashboards' }).focus()
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    await expect(card.getByRole('tab', { name: 'Logs' })).toHaveAttribute('aria-selected', 'true')
    const list = card.getByRole('list', { name: /log lines$/ })
    await expect(card.getByRole('status').first()).toHaveText(/lines match, newest first\./)
    await expectNoA11yViolations(page)
    // The first line takes the one Tab stop; arrows move through the lines.
    await list.getByRole('listitem').first().getByRole('button').first().focus()
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    await expect(page.locator(':focus')).toHaveAttribute('id', /-line-2$/)
    await page.keyboard.press('End')
    await expect(page.locator(':focus').locator('xpath=..')).toHaveAttribute(
      'aria-posinset',
      (await list.getByRole('listitem').last().getAttribute('aria-setsize')) ?? '',
    )
    await page.keyboard.press('Home')
    // A line's trace, from the keyboard.
    const trace = list.getByRole('button', { name: /^Trace [0-9a-f]{8} for line \d+$/ }).first()
    await trace.focus()
    await page.keyboard.press('Enter')
    await expect(card.getByRole('tab', { name: 'Traces' })).toHaveAttribute('aria-selected', 'true')
    await expect(card.getByRole('tree').getByRole('treeitem', { selected: true })).toBeVisible()
    await expectNoA11yViolations(page)
    await card.getByRole('button', { name: 'Logs for this span' }).click()
    await expect(card.getByRole('status').first()).toHaveText(/^1 line matches/)
  },
)
