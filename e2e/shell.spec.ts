import type { Page } from '@playwright/test'
import { acTest } from './ac.ts'
import { expect, expectNoA11yViolations, test } from './fixtures.ts'

/** Presses Tab until the focused element is the link or button named `name`, then returns. */
async function tabTo(page: Page, name: string): Promise<void> {
  for (let i = 0; i < 60; i++) {
    await page.keyboard.press('Tab')
    const focused = page.locator(':focus')
    if ((await focused.count()) && (await focused.textContent())?.trim() === name) return
  }
  throw new Error(`Tab never reached "${name}"`)
}

const scrollY = (page: Page) => page.evaluate<number>('window.scrollY')

const fullTitle = (title: string) =>
  title === 'Beyond the Glass' ? title : `${title} · Beyond the Glass`

async function expectPage(page: Page, title: string) {
  const h1 = page.getByRole('heading', { level: 1 })
  await expect(h1).toHaveText(title)
  await expect(page).toHaveTitle(fullTitle(title))
  await expect(h1).toBeFocused()
  await expect(page.getByTestId('route-announcer')).toHaveText(title)
}

test.describe('E2-01 app shell', () => {
  acTest(
    'E2-01.AC1',
    'every top-level route is reachable with Tab and Enter only',
    async ({ page }) => {
      await page.goto('./')
      await expect(page.getByRole('heading', { level: 1, name: 'Beyond the Glass' })).toBeVisible()
      // The skip link is the first stop and lands on main.
      await page.keyboard.press('Tab')
      await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused()
      await page.keyboard.press('Enter')
      await expect(page.getByRole('main')).toBeFocused()
      // The skip link must not change the hash route.
      expect(['', '#/']).toContain(new URL(page.url()).hash)

      const journey: [link: string, title: string][] = [
        ['Step up to the Threshold', 'The Threshold'],
        ['Skip the Threshold and start from the very beginning', 'Your trail'],
        ['View the map', 'Map of the Reach'],
        ['Stormwatch', 'Stormwatch'],
        ['Enter the war room', 'Stormwatch'],
        ['Field Guide', 'Field Guide'],
        ['Settings', 'Settings'],
        ['Lead view', 'Lead view'],
        ['Map', 'Map of the Reach'],
        ['Beyond the Glass', 'Beyond the Glass'],
      ]
      for (const [link, title] of journey) {
        await tabTo(page, link)
        await page.keyboard.press('Enter')
        await expectPage(page, title)
        await expectNoA11yViolations(page)
      }
    },
  )

  acTest(
    'E2-01.AC2',
    'back and forward restore the view and the scroll position',
    async ({ page }) => {
      // Short enough that the map scrolls.
      await page.setViewportSize({ width: 800, height: 320 })
      await page.goto('./#/map')
      await expect(page.getByRole('heading', { level: 1, name: 'Map of the Reach' })).toBeVisible()
      await page.evaluate('window.scrollTo(0, document.documentElement.scrollHeight)')
      const scrolled = await scrollY(page)
      expect(scrolled).toBeGreaterThan(100)

      await page.getByRole('link', { name: 'Stormwatch' }).first().click()
      await expect(page.getByRole('heading', { level: 1, name: 'Stormwatch' })).toBeVisible()
      // A new page starts at the top.
      await expect.poll(() => scrollY(page)).toBe(0)

      await page.goBack()
      await expect(page.getByRole('heading', { level: 1, name: 'Map of the Reach' })).toBeVisible()
      await expect(page).toHaveTitle(fullTitle('Map of the Reach'))
      await expect.poll(() => scrollY(page)).toBe(scrolled)

      await page.goForward()
      await expect(page.getByRole('heading', { level: 1, name: 'Stormwatch' })).toBeVisible()
      await expect.poll(() => scrollY(page)).toBe(0)
    },
  )

  acTest('E2-01.AC3', 'an unknown route shows the 404 view with a link home', async ({ page }) => {
    for (const route of ['./#/nowhere/at/all', './#/region/no-such-region', './#/lesson/nope/3']) {
      await page.goto(route)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(
        "This path doesn't lead anywhere yet",
      )
      await expectNoA11yViolations(page)
    }
    await page.getByRole('link', { name: 'Back to the Console Room' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Beyond the Glass' })).toBeVisible()
  })

  acTest(
    'E2-01.AC4',
    'the shell renders while content loads, with a skeleton and no layout shift over 0.1',
    async ({ page, browserName }) => {
      test.skip(browserName !== 'chromium', 'layout-shift entries are only reported by Chromium')
      let release: () => void = () => undefined
      const held = new Promise<void>((r) => {
        release = r
      })
      await page.route('**/assets/_virtual_btg-content-*.js', async (route) => {
        await held
        await route.continue()
      })
      // Sums layout-shift scores (excluding shifts caused by input), the way CLS is measured.
      await page.addInitScript(`
        window.__cls = 0
        new PerformanceObserver((list) => {
          for (const e of list.getEntries()) if (!e.hadRecentInput) window.__cls += e.value
        }).observe({ type: 'layout-shift', buffered: true })
      `)
      await page.goto('./#/map')
      // Shell is up while the manifest is held back.
      await expect(page.getByRole('banner')).toBeVisible()
      await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible()
      await expect(page.getByRole('contentinfo')).toBeVisible()
      await expect(page.getByTestId('page-skeleton')).toBeVisible()
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(0)
      await expectNoA11yViolations(page)

      release()
      await expect(page.getByRole('heading', { level: 1, name: 'Map of the Reach' })).toBeVisible()
      await expect(page.getByTestId('page-skeleton')).toHaveCount(0)
      await expect(page.getByTestId('progress-indicator')).toHaveText(/regions complete/)
      // Let any late shifts land before measuring.
      await page.waitForTimeout(300)
      const cls = await page.evaluate<number>('window.__cls')
      expect(cls).toBeLessThan(0.1)
    },
  )
})
