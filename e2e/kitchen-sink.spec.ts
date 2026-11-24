import { acTest } from './ac.ts'
import { expect, expectNoA11yViolations } from './fixtures.ts'

const MOODS = [
  ['Console Room', 'console'],
  ['The Reach', 'reach'],
  ['Stormwatch', 'stormwatch'],
] as const

acTest(
  ['E1-03.AC1', 'E1-03.AC2'],
  'the kitchen sink shows every primitive and passes axe in every mood and open state',
  async ({ page }) => {
    await page.goto('./#/kitchen-sink')
    await expect(page.getByRole('heading', { level: 1, name: 'Kitchen sink' })).toBeVisible()
    // Every primitive has a demo.
    for (const region of [
      'Buttons',
      'Dialog and toast',
      'Tabs',
      'Choices',
      'Status and progress',
      'Callouts, keys and code',
    ])
      await expect(page.getByRole('region', { name: region })).toBeVisible()
    await expect(page.getByRole('tablist', { name: 'Depth' })).toBeVisible()
    await expect(page.getByRole('progressbar', { name: 'Lessons in Helm Keep' })).toBeVisible()
    await expect(
      page.getByRole('checkbox', { name: 'Remind me to export my progress' }),
    ).toBeChecked()
    await expect(page.getByRole('region', { name: 'shell code' })).toBeVisible()

    for (const [label, mood] of MOODS) {
      await page.getByRole('radio', { name: label }).check()
      await expect(page.getByRole('radio', { name: label })).toBeChecked()
      // Audit once the new palette is in place.
      await expect(page.locator('html')).toHaveAttribute('data-mood', mood)
      await expect(page.getByRole('heading', { level: 1, name: 'Kitchen sink' })).toBeVisible()
      await expectNoA11yViolations(page)
    }

    // Open states: tooltip (via keyboard focus), dialog, toast.
    await page.getByRole('button', { name: 'Hover or focus me' }).focus()
    await expect(page.getByRole('tooltip')).toHaveText(/Opens on hover and on focus/)
    await expectNoA11yViolations(page)
    await page.keyboard.press('Escape')

    await page.getByRole('button', { name: 'Open a dialog' }).click()
    const dialog = page.getByRole('dialog', { name: 'Leave the scenario?' })
    await expect(dialog).toBeVisible()
    await expectNoA11yViolations(page)
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(page.getByRole('button', { name: 'Open a dialog' })).toBeFocused()

    await page.getByRole('button', { name: 'Show a toast' }).click()
    await expect(page.getByText('Progress saved').first()).toBeVisible()
    await expectNoA11yViolations(page)
  },
)

acTest(
  'E1-03.AC1',
  'radio groups and tabs follow the keyboard patterns in a real browser',
  async ({ page }) => {
    await page.goto('./#/kitchen-sink')
    const question = page.getByRole('radiogroup', { name: /CrashLoopBackOff/ })
    // As a learner would: choose an option, then use the arrow keys.
    await question.getByRole('radio', { name: 'I’m not sure yet' }).click()
    await expect(question.getByRole('radio', { name: 'I’m not sure yet' })).toBeFocused()
    await page.keyboard.press('ArrowUp')
    // Arrow keys move and select.
    await expect(question.getByRole('radio', { name: 'The node it runs on' })).toBeChecked()
    await expect(question.getByRole('radio', { name: 'The node it runs on' })).toBeFocused()

    await page.getByRole('tab', { name: 'ELI5' }).focus()
    await page.keyboard.press('End')
    await expect(page.getByRole('tab', { name: 'Deep dive' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await expect(page.getByRole('tabpanel')).toContainText('share a network namespace')
  },
)
