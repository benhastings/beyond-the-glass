import { acTest } from './ac.ts'
import { expect, expectNoA11yViolations } from './fixtures.ts'

acTest(
  'E2-05.AC2',
  'the Field Guide searches by acronym, shows the Rosetta Stone, and passes axe',
  async ({ page }) => {
    await page.goto('./#/guide')
    await expect(page.getByRole('table', { name: /Rosetta Stone/ })).toBeVisible()
    await expect(page.getByRole('row')).toHaveCount(23)
    await page.getByRole('searchbox', { name: 'Search the Field Guide' }).fill('HPA')
    const results = page.getByRole('list', { name: 'Search results' })
    await expect(results.getByRole('link').first()).toHaveText('Horizontal Pod Autoscaler')
    await expectNoA11yViolations(page)
    await results.getByRole('link').first().click()
    await expect(
      page.getByRole('heading', { level: 1, name: 'Horizontal Pod Autoscaler' }),
    ).toBeVisible()
    await expect(page.getByText(/^Then:/)).toBeVisible()
  },
)

acTest(
  'E2-05.AC3',
  'a term in a lesson previews on keyboard focus and closes with Esc',
  async ({ page }) => {
    await page.goto('./#/lesson/your-first-look/1')
    const term = page.getByRole('link', { name: 'pods', exact: true })
    await term.focus()
    await expect(page.getByRole('tooltip')).toContainText('Pod:')
    await page.keyboard.press('Escape')
    await expect(page.getByRole('tooltip')).toHaveCount(0)
    await expectNoA11yViolations(page)
  },
)
