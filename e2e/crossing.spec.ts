import type { Page } from '@playwright/test'
import { acTest } from './ac.ts'
import { expect, expectNoA11yViolations, withSettings } from './fixtures.ts'
import { flashesPerSecond, meanLuminance } from './png.ts'

const crossing = (page: Page) => page.getByRole('dialog', { name: 'The Crossing' })

/** Through the Threshold (skipped) to "Step through the glass". */
async function stepThrough(page: Page) {
  await page.goto('./#/threshold')
  await page
    .getByRole('button', { name: 'Skip the Threshold and start from the very beginning' })
    .click()
  await page.getByRole('button', { name: 'Step through the glass' }).click()
}

acTest(
  ['E1-06.AC3', 'E1-06.AC4'],
  'plays once on stepping through, then focus lands on the map heading with the arrival announced',
  async ({ page }) => {
    await stepThrough(page)
    await expect(crossing(page)).toBeVisible()
    // Skip is focused at once, and everything behind is inert.
    await expect(page.getByRole('button', { name: 'Skip (Esc)' })).toBeFocused()
    await expectNoA11yViolations(page)
    // It ends by itself in under 3 s.
    await expect(crossing(page)).toBeHidden({ timeout: 3500 })
    await expect(page.getByRole('heading', { level: 1, name: 'Map of the Reach' })).toBeFocused()
    await expect(page.getByTestId('route-announcer')).toHaveText(
      'You step through the glass, into the Reach.',
    )
    // Once: stepping through again goes straight to the map.
    await page.goto('./#/threshold/results')
    await page.getByRole('button', { name: 'Step through the glass' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Map of the Reach' })).toBeVisible()
    await expect(crossing(page)).toHaveCount(0)
  },
)

acTest('E1-06.AC4', 'Skip and Esc end it at once; Settings replays it', async ({ page }) => {
  await stepThrough(page)
  await expect(crossing(page)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(crossing(page)).toHaveCount(0)
  await expect(page.getByRole('heading', { level: 1, name: 'Map of the Reach' })).toBeFocused()

  await page.goto('./#/settings')
  await page.getByRole('button', { name: 'Replay the Crossing' }).click()
  await expect(crossing(page)).toBeVisible()
  await page.getByRole('button', { name: 'Skip (Esc)' }).click()
  await expect(crossing(page)).toHaveCount(0)
  await expect(page.getByRole('heading', { level: 1, name: 'Map of the Reach' })).toBeFocused()
})

acTest(
  'E1-06.AC4',
  'with reduced motion it is a 400 ms crossfade with a line of narrative',
  async ({ page }) => {
    await withSettings(page, { reduceMotion: 'on' })
    await page.goto('./#/settings')
    await page.getByRole('button', { name: 'Replay the Crossing' }).click()
    const dialog = crossing(page)
    await expect(dialog).toHaveAttribute('data-mode', 'reduce')
    await expect(dialog.getByText('You step through the glass, into the Reach.')).toBeVisible()
    // Only opacity moves: no animations, a 400 ms opacity transition.
    expect(
      await page.evaluate<number>(
        'document.getAnimations().filter((a) => !(a instanceof CSSTransition)).length',
      ),
    ).toBe(0)
    const transition = await page.evaluate<string>(
      `getComputedStyle(document.querySelector('.btg-cross-map')).transition`,
    )
    expect(transition).toMatch(/^opacity 0\.4s/)
    await expect(dialog).toHaveCount(0, { timeout: 2500 })
    await expect(page.getByRole('heading', { level: 1, name: 'Map of the Reach' })).toBeFocused()
  },
)

acTest(
  'E1-06.AC2',
  'nothing flashes more than three times a second (frame-by-frame luminance)',
  async ({ page }) => {
    await page.setViewportSize({ width: 480, height: 300 })
    await page.clock.install()
    await page.goto('./#/settings')
    await page.getByRole('button', { name: 'Replay the Crossing' }).click()
    await expect(crossing(page)).toBeVisible()
    // Hold the sequence still, then step through it 40 ms at a time.
    await page.evaluate('document.getAnimations().forEach((a) => a.pause())')
    const dt = 40
    const lum: number[] = []
    for (let t = 0; t <= 2800; t += dt) {
      await page.evaluate(
        `document.getAnimations().forEach((a) => { a.currentTime = ${String(t)} })`,
      )
      lum.push(meanLuminance(await page.screenshot({ animations: 'allow', caret: 'initial' })))
    }
    // It does go from the dark room to the bright Reach…
    expect((lum.at(-1) ?? 0) - (lum[0] ?? 0)).toBeGreaterThan(0.1)
    // …without flashing.
    expect(flashesPerSecond(lum, dt)).toBeLessThanOrEqual(3)
  },
)
