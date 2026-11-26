import type { Page } from '@playwright/test'
import { acTest } from './ac.ts'
import { expect, expectNoA11yViolations, test } from './fixtures.ts'

const panes = (page: Page) => page.locator('[data-testid="btg-war-room"] section[data-pane]')
const paneWidths = (page: Page) =>
  page.evaluate<number[]>(
    `[...document.querySelectorAll('[data-testid="btg-war-room"] section[data-pane]')].map((e) => e.getBoundingClientRect().width)`,
  )
/** How far anything on the page runs past the viewport sideways (0 when nothing does). */
const overflow = (page: Page) =>
  page.evaluate<number>(
    'document.documentElement.scrollWidth - document.documentElement.clientWidth',
  )

acTest(
  'E10-04.AC1',
  'panes are landmarks with headings, and Alt+number jumps between them',
  async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 })
    await page.goto('./#/stormwatch')
    await expect(page.getByRole('region', { name: /^The incident/ })).toBeVisible()
    await expect(page.getByRole('region', { name: /^Terminal/ })).toBeVisible()
    await page.keyboard.press('Alt+2')
    await expect(page.getByRole('heading', { level: 2, name: /^Terminal/ })).toBeFocused()
    await page.keyboard.press('Alt+4')
    await expect(
      page.getByRole('heading', { level: 2, name: /^Pipelines and merge requests/ }),
    ).toBeFocused()
    await page.keyboard.press('?')
    await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toContainText(
      'Alt+6: Explore logs and traces',
    )
    await page.keyboard.press('Escape')
    await expectNoA11yViolations(page)
  },
)

acTest(
  'E10-04.AC2',
  'two panes at 1280×720, three at 1920×1080, tabs below 1024 px; nothing runs off the side',
  async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 })
    await page.goto('./#/stormwatch')
    await expect(panes(page)).toHaveCount(2)
    expect(await overflow(page)).toBeLessThanOrEqual(0)
    const [a, b] = await paneWidths(page)
    expect(Math.min(a ?? 0, b ?? 0)).toBeGreaterThan(500)

    await page.setViewportSize({ width: 1920, height: 1080 })
    await page.getByRole('radio', { name: 'Three panes' }).check()
    await expect(panes(page)).toHaveCount(3)
    expect(await overflow(page)).toBeLessThanOrEqual(0)
    const widths = await paneWidths(page)
    expect(Math.min(...widths)).toBeGreaterThan(500)
    await expectNoA11yViolations(page)

    await page.setViewportSize({ width: 900, height: 800 })
    await expect(page.getByRole('tablist', { name: 'War room panes' })).toBeVisible()
    await expect(panes(page)).toHaveCount(1)
    await page.getByRole('tab', { name: 'Dashboards' }).click()
    await expect(page.getByRole('region', { name: /^Dashboards/ })).toBeVisible()
    expect(await overflow(page)).toBeLessThanOrEqual(0)
    await expectNoA11yViolations(page)
  },
)

acTest('E10-04.AC3', 'the pane layout survives a reload', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto('./#/stormwatch')
  await page.getByRole('radio', { name: 'Three panes' }).check()
  await page.getByRole('combobox', { name: 'Pane 3' }).selectOption('argo')
  await page
    .getByRole('region', { name: /^Argo CD/ })
    .getByRole('button', { name: 'Maximize Argo CD' })
    .click()
  await expect(panes(page)).toHaveCount(1)
  await page.reload()
  await expect(panes(page)).toHaveCount(1)
  await expect(page.getByRole('region', { name: /^Argo CD/ })).toBeVisible()
  await page.getByRole('button', { name: 'Restore Argo CD' }).click()
  await expect(panes(page)).toHaveCount(3)
  await expect(page.getByRole('radio', { name: 'Three panes' })).toBeChecked()
  await expect(page.getByRole('combobox', { name: 'Pane 3' })).toHaveValue('argo')
})

acTest('E10-04.AC4', 'the war room downloads only when /stormwatch opens', async ({ page }) => {
  const scripts: string[] = []
  page.on('request', (r) => {
    if (r.resourceType() === 'script') scripts.push(r.url())
  })
  await page.goto('./#/')
  await page.goto('./#/map')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  expect(scripts.filter((u) => /WarRoom/.test(u))).toEqual([])
  await page.goto('./#/stormwatch')
  await expect(page.getByTestId('btg-war-room')).toBeVisible()
  expect(scripts.filter((u) => /WarRoom/.test(u))).toHaveLength(1)
})

test('incident notes are kept across a reload', async ({ page }) => {
  await page.goto('./#/stormwatch')
  await expect(page.getByTestId('btg-war-room')).toBeVisible()
  await page.keyboard.press('Alt+7')
  const notes = page.getByRole('textbox', { name: /^What you know/ })
  await notes.fill('stage was fine; prod is the one paging')
  await page.reload()
  await expect(page.getByTestId('btg-war-room')).toBeVisible()
  await page.keyboard.press('Alt+7')
  await expect(page.getByRole('textbox', { name: /^What you know/ })).toHaveValue(
    'stage was fine; prod is the one paging',
  )
})

test('a finished night shows its badge on the map, linking to the debrief', async ({ page }) => {
  const at = '2026-11-26T10:00:00.000Z'
  const progress = {
    schemaVersion: 1,
    createdAt: at,
    updatedAt: at,
    scenarios: { 'the-long-night': { completedAt: at } },
  }
  await page.addInitScript(
    `localStorage.setItem('btg:progress', ${JSON.stringify(JSON.stringify({ state: { progress }, version: 1 }))})`,
  )
  await page.goto('./#/map')
  await expect(page.getByRole('region', { name: 'Badges' })).toContainText('The Long Night')
  await expectNoA11yViolations(page)
  await page.getByRole('link', { name: 'Read your debrief' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Stormwatch' })).toBeVisible()
})
