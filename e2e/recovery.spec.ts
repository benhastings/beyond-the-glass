import { readFileSync } from 'node:fs'
import { acTest } from './ac.ts'
import { expect, expectNoA11yViolations } from './fixtures.ts'

const KEY = 'btg:progress'

acTest(
  'E3-02.AC2',
  'the recovery dialog is accessible, offers the old data, and appears once per incident',
  async ({ page }) => {
    // Unreadable progress, planted before the app loads (and only on the first load).
    await page.goto('./')
    await page.evaluate(`localStorage.setItem('${KEY}', '{not json at all')`)
    await page.reload()

    const dialog = page.getByRole('dialog', { name: 'Your saved progress couldn’t be read' })
    await expect(dialog).toBeVisible()
    // A real modal: focus is inside it, and axe finds nothing wrong.
    await expect(page.getByRole('button', { name: 'Download the old data' })).toBeFocused()
    await expectNoA11yViolations(page)

    // The old data comes back exactly as it was.
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Download the old data' }).click(),
    ])
    expect(download.suggestedFilename()).toMatch(
      /^beyond-the-glass-progress-backup-\d{4}-\d\d-\d\d\.json$/,
    )
    expect(readFileSync(await download.path(), 'utf8')).toBe('{not json at all')

    // It's kept in this browser too.
    const backups = await page.evaluate<string[]>(
      `Object.keys(localStorage).filter((k) => k.startsWith('${KEY}:backup:'))`,
    )
    expect(backups).toHaveLength(1)

    // Esc closes it, and focus lands on the page's main content.
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(page.getByRole('main')).toBeFocused()

    // Reloading doesn't bring it back: one incident, one dialog.
    await page.reload()
    await expect(page.getByRole('heading', { level: 1, name: 'Beyond the Glass' })).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCount(0)
  },
)
