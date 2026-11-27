import type { Page } from '@playwright/test'
import { acTest } from './ac.ts'
import { expect, expectNoA11yViolations } from './fixtures.ts'

/** How far the page runs past the viewport sideways (0 when nothing does). */
const overflow = (page: Page) =>
  page.evaluate<number>(
    'document.documentElement.scrollWidth - document.documentElement.clientWidth',
  )

const VIEWPORTS = {
  desktop: { width: 1280, height: 800 },
  tablet: { width: 820, height: 1180 },
  phone: { width: 390, height: 844 },
} as const

acTest('E11-03.AC1', 'the full journey on a desktop: landing to the war room', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.desktop)
  await page.goto('./')
  await page.getByRole('link', { name: 'Step up to the Threshold' }).click()
  await page
    .getByRole('button', { name: 'Skip the Threshold and start from the very beginning' })
    .click()
  await page.getByRole('button', { name: 'Step through the glass' }).click()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('heading', { level: 1, name: 'Map of the Reach' })).toBeFocused()
  await page.goto('./#/region/chartroom')
  await expect(page.getByRole('heading', { level: 1, name: 'The Chartroom' })).toBeVisible()
  await page.goto('./#/lesson/your-first-look')
  await page.getByRole('link', { name: 'Next step →' }).click()
  await page.getByRole('link', { name: 'Next step →' }).click()
  const command = page.getByRole('textbox', { name: 'Command' })
  await command.fill('kubectl get pods -n ravenpost')
  await command.press('Enter')
  await command.fill('answer failing-pod ravenpost-notifier')
  await command.press('Enter')
  await expect(page.getByText(/^Challenge complete\./)).toBeVisible()
  await page.goto('./#/stormwatch')
  await expect(page.locator('section[data-pane]')).toHaveCount(2)
  expect(await overflow(page)).toBeLessThanOrEqual(0)
  await expectNoA11yViolations(page)
})

acTest(
  'E11-03.AC1',
  'a tablet: lessons read without sideways scrolling, and the war room is tabs',
  async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.tablet)
    await page.goto('./#/lesson/your-first-look')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    expect(await overflow(page)).toBeLessThanOrEqual(0)
    await page.goto('./#/stormwatch')
    await expect(page.getByRole('tablist', { name: 'War room panes' })).toBeVisible()
    await page.getByRole('tab', { name: 'Terminal' }).click()
    await expect(page.getByRole('textbox', { name: 'Command' })).toBeVisible()
    expect(await overflow(page)).toBeLessThanOrEqual(0)
    await expectNoA11yViolations(page)
  },
)

acTest(
  'E11-03.AC1',
  'a phone: lessons and the quiz read fully; simulator panes say they’re best on a larger screen, and still work',
  async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.phone)
    await page.goto('./#/threshold')
    await page.getByRole('button', { name: 'Begin', exact: true }).click()
    await expect(page.getByRole('radio').first()).toBeVisible()
    expect(await overflow(page)).toBeLessThanOrEqual(0)
    await page.goto('./#/lesson/your-first-look')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    expect(await overflow(page)).toBeLessThanOrEqual(0)
    await page.getByRole('link', { name: 'Next step →' }).click()
    await page.getByRole('link', { name: 'Next step →' }).click()
    await expect(page.getByText(/^The terminal works best on a larger screen/)).toBeVisible()
    const command = page.getByRole('textbox', { name: 'Command' })
    await command.fill('kubectl get pods -n ravenpost')
    await command.press('Enter')
    await expect(page.getByRole('log', { name: /terminal output/ })).toContainText(
      'CrashLoopBackOff',
    )
    expect(await overflow(page)).toBeLessThanOrEqual(0)
    await page.goto('./#/stormwatch')
    await expect(page.getByText(/^The war room works best on a larger screen/)).toBeVisible()
    await page.getByRole('tab', { name: 'Terminal' }).click()
    await expect(page.getByRole('textbox', { name: 'Command' })).toBeVisible()
    expect(await overflow(page)).toBeLessThanOrEqual(0)
    await expectNoA11yViolations(page)
  },
)
