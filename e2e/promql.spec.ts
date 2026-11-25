import { acTest } from './ac.ts'
import { expect, expectNoA11yViolations } from './fixtures.ts'

acTest(
  ['E8-03.AC2', 'E8-03.AC3'],
  'the PromQL explorer works from the keyboard: autocomplete, run, table, starter queries, and clear errors',
  async ({ page }) => {
    await page.goto('./#/kitchen-sink')
    const card = page.locator('#promql')
    const box = card.getByRole('combobox', { name: 'PromQL query' })
    await box.focus()
    await page.keyboard.press('ControlOrMeta+a')
    await page.keyboard.press('Backspace')
    await page.keyboard.type('kube_dep')
    await expect(box).toHaveAttribute('aria-expanded', 'true')
    await page.keyboard.press('ArrowDown')
    await expect(
      card.getByRole('option', { name: /kube_deployment_status_replicas_available/ }),
    ).toHaveAttribute('aria-selected', 'true')
    await expectNoA11yViolations(page)
    await page.keyboard.press('Enter')
    await expect(box).toHaveValue('kube_deployment_status_replicas_available')
    await page.keyboard.press('Enter')
    await expect(
      card.getByRole('figure', { name: /Result of kube_deployment_status_replicas_available/ }),
    ).toBeVisible()
    await card.getByRole('tab', { name: 'Graph' }).focus()
    await page.keyboard.press('ArrowRight')
    await expect(card.getByRole('table').getByRole('row')).toHaveCount(7)
    await expectNoA11yViolations(page)
    // A starter query, then something this simulation doesn't have.
    await card.getByRole('button', { name: 'Run this query: p99 latency (seconds)' }).click()
    await expect(box).toHaveValue(/^histogram_quantile\(0\.99/)
    await box.fill('predict_linear(container_memory_working_set_bytes[1h], 3600)')
    await box.press('Enter')
    await expect(card.getByRole('alert')).toContainText(
      '"predict_linear" isn\'t available in this simulation — try rate()',
    )
    await expectNoA11yViolations(page)
  },
)
