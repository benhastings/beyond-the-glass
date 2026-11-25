import { acTest } from './ac.ts'
import { expect, expectNoA11yViolations } from './fixtures.ts'

acTest(
  'E2-02.AC1',
  'a new visitor reaches the first quiz question in two clicks',
  async ({ page }) => {
    await page.goto('./')
    await page.getByRole('link', { name: 'Step up to the Threshold' }).click()
    await page.getByRole('button', { name: 'Begin', exact: true }).click()
    await expect(page.getByText('Question 1 of 10')).toBeVisible()
  },
)

acTest(
  'E2-02.AC4',
  'usable at 320 px wide and at 400% zoom: no sideways scrolling, nothing clipped',
  async ({ page }) => {
    // 400% zoom of a 1280 px window is a 320 CSS px viewport.
    await page.setViewportSize({ width: 320, height: 640 })
    await page.goto('./')
    await expect(page.getByRole('link', { name: 'Step up to the Threshold' })).toBeVisible()
    expect(
      await page.evaluate<boolean>('document.documentElement.scrollWidth <= window.innerWidth'),
    ).toBe(true)
    for (const el of await page.locator('main a, main h2, main li').all()) {
      const box = await el.boundingBox()
      if (box) expect(box.x + box.width).toBeLessThanOrEqual(321)
    }
    await expectNoA11yViolations(page)
  },
)
