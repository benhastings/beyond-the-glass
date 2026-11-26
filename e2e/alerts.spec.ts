import { test } from '@playwright/test'
import { expect, expectNoA11yViolations } from './fixtures.ts'

test('alerts: the pager, the rules and the SLO, from the keyboard, and axe passes', async ({
  page,
}) => {
  await page.goto('./#/kitchen-sink')
  const card = page.locator('#workspace')
  const pager = card.getByRole('alert')
  await expect(pager).toContainText('Paged:')
  await expectNoA11yViolations(page)
  await pager.getByRole('button', { name: 'See alerts' }).focus()
  await page.keyboard.press('Enter')
  await expect(card.getByRole('tab', { name: 'Alerts' })).toHaveAttribute('aria-selected', 'true')
  await expect(
    card.getByRole('region', { name: 'Alerts' }).getByText('Firing').first(),
  ).toBeVisible()
  await card.getByText('Rule, runbook and history').first().focus()
  await page.keyboard.press('Enter')
  await expect(card.getByText(/^runbooks\.ravenpost\.example\//).first()).toBeVisible()
  const slo = card.getByRole('region', { name: 'Service level objectives' })
  await slo.getByRole('tab', { name: 'ELI5' }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(slo.getByText(/Burn rate = error ratio ÷ budget/)).toBeVisible()
  await expectNoA11yViolations(page)
  await pager.getByRole('button', { name: 'Acknowledge' }).click()
  await expect(pager).toBeHidden()
})
