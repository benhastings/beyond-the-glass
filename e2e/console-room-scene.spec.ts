import type { Page } from '@playwright/test'
import { acTest } from './ac.ts'
import { expect, withSettings } from './fixtures.ts'

/** The scene's running animations: name, and total length in ms. */
const animations = (page: Page) =>
  page.evaluate<{ name: string; total: number }[]>(`
    [...document.querySelector('svg[data-scene="console-room"]').getAnimations({ subtree: true })].map((a) => {
      const t = a.effect.getComputedTiming()
      return { name: a.animationName, total: t.endTime }
    })`)

acTest(
  'E1-04.AC3',
  'the idle animation runs for at most five seconds, and not at all under reduced motion',
  async ({ page }) => {
    await page.goto('./')
    await expect(page.locator('svg[data-scene="console-room"]')).toBeVisible()
    const running = await animations(page)
    expect(running.length).toBeGreaterThan(5)
    for (const a of running) expect(a.total).toBeLessThanOrEqual(5000)

    // The operating system asks for reduced motion.
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.reload()
    await expect(page.locator('svg[data-scene="console-room"]')).toBeVisible()
    expect(await animations(page)).toEqual([])
    const glass = await page.evaluate<string>(
      `getComputedStyle(document.querySelector('svg[data-scene="console-room"] .btg-glass-breath')).opacity`,
    )
    expect(glass).toBe('0.85')
  },
)

acTest('E1-04.AC3', 'the in-app reduce-motion setting stops it too', async ({ page }) => {
  await withSettings(page, { reduceMotion: 'on' })
  await page.goto('./')
  await expect(page.locator('svg[data-scene="console-room"]')).toBeVisible()
  expect(await animations(page)).toEqual([])
})
