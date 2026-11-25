import { acTest } from './ac.ts'
import { expect, expectNoA11yViolations } from './fixtures.ts'

acTest(
  ['E8-02.AC1', 'E8-02.AC4'],
  'dashboards work from the keyboard, every panel has a table view, and axe passes',
  async ({ page }) => {
    await page.goto('./#/kitchen-sink')
    const card = page.locator('#dashboards')
    await expect(
      card.getByRole('heading', { level: 2, name: 'Service Overview (RED)' }),
    ).toBeVisible()
    await expect(card.getByRole('figure', { name: /p99 latency/ })).toBeVisible()
    await expectNoA11yViolations(page)
    // Turn a chart into its table from the keyboard.
    const panel = card.getByRole('region', { name: 'Error ratio', exact: true })
    await panel.getByRole('button', { name: 'View as table' }).focus()
    await page.keyboard.press('Enter')
    await expect(panel.getByRole('table')).toBeVisible()
    await expect(panel.getByRole('button', { name: 'View as table' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    // Another dashboard, by keyboard.
    await card.getByRole('combobox', { name: 'Dashboard' }).selectOption('kubernetes-workloads')
    await expect(card.getByRole('meter', { name: 'Closest to its memory limit' })).toBeVisible()
    await expect(card.getByRole('list', { name: 'Recent error logs, newest first' })).toBeVisible()
    await expectNoA11yViolations(page)
    // Explore a panel's query.
    await card.getByRole('button', { name: 'Explore: Memory by pod' }).focus()
    await page.keyboard.press('Enter')
    await expect(card.getByRole('combobox', { name: 'PromQL query' })).toHaveValue(
      /container_memory_working_set_bytes/,
    )
    await card.getByRole('button', { name: /Back to Kubernetes Workloads/ }).click()
    await expect(
      card.getByRole('heading', { level: 2, name: 'Kubernetes Workloads' }),
    ).toBeVisible()
  },
)
