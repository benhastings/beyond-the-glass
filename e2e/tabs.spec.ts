import { acTest } from './ac.ts'
import { expect } from './fixtures.ts'

acTest(
  'E3-04.AC1',
  'a change in one tab shows in another within a second',
  async ({ page, context }) => {
    const tabB = await context.newPage()
    await page.goto('./#/map?view=list')
    await tabB.goto('./#/map?view=list')
    await expect(tabB.getByRole('link', { name: /^The Console Room,/ })).toBeVisible()
    // Tab A: skip the Threshold, which sets a placement and saves.
    await page.goto('./#/threshold')
    await page
      .getByRole('button', { name: 'Skip the Threshold and start from the very beginning' })
      .click()
    await expect(page.getByRole('heading', { level: 1, name: 'Your trail' })).toBeVisible()
    const started = Date.now()
    // Tab B picks it up from storage and says so.
    await expect(tabB.getByText(/Your progress was updated in another tab/)).toBeVisible({
      timeout: 1000,
    })
    expect(Date.now() - started).toBeLessThan(1000)
    expect(
      await tabB.evaluate<string>(
        'JSON.parse(localStorage.getItem("btg:progress")).state.progress.threshold.completedAt',
      ),
    ).toBeTruthy()
  },
)
