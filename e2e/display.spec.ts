import type { Page } from '@playwright/test'
import { acTest } from './ac.ts'
import { expect, expectNoA11yViolations, test } from './fixtures.ts'

const ROUTES = [
  './',
  './#/threshold',
  './#/threshold/results',
  './#/map',
  './#/region/chartroom',
  './#/region/console-room',
  './#/region/stormwatch',
  './#/guide',
  './#/settings',
  './#/lead',
  './#/stormwatch',
  './#/nowhere',
]

/** Stored progress with the given settings, planted before the app loads. */
async function withSettings(page: Page, settings: Record<string, unknown>) {
  const at = '2026-11-24T10:00:00.000Z'
  const progress = {
    schemaVersion: 1,
    createdAt: at,
    updatedAt: at,
    settings: { reduceMotion: 'system', highContrast: 'system', textSize: 100, ...settings },
  }
  await page.addInitScript(
    `localStorage.setItem('btg:progress', ${JSON.stringify(JSON.stringify({ state: { progress }, version: 1 }))})`,
  )
}

const rgb = (hex: string) =>
  `rgb(${[1, 3, 5].map((i) => String(parseInt(hex.slice(i, i + 2), 16))).join(', ')})`

/** Every element's box, to prove a palette change moved nothing. */
const boxes = (page: Page) =>
  page.evaluate<string>(
    `JSON.stringify([...document.body.querySelectorAll('*')].map((e) => { const r = e.getBoundingClientRect(); return [e.tagName, r.x, r.y, r.width, r.height] }))`,
  )

test.describe('E1-02 theming and display preferences', () => {
  acTest(
    'E1-02.AC1',
    'switching region updates accent colours with no layout shift',
    async ({ page }) => {
      await page.goto('./#/region/harbor')
      const h1 = page.getByRole('heading', { level: 1, name: 'The Harbor' })
      const summary = page.getByTestId('region-summary')
      await expect(h1).toHaveCSS('color', rgb('#156a70'))
      await expect(summary).toHaveCSS('background-color', rgb('#e6f4f4'))
      expect(await page.evaluate<string>('document.documentElement.dataset.mood')).toBe('reach')

      // The palette alone changes: every box stays exactly where it was.
      const before = await boxes(page)
      await page.evaluate(`document.documentElement.dataset.region = 'chartroom'`)
      await expect(h1).toHaveCSS('color', rgb('#8a4b17'))
      await expect(summary).toHaveCSS('background-color', rgb('#fbeedd'))
      expect(await boxes(page)).toBe(before)

      // Navigating to another region applies its palette.
      await page.evaluate(`location.hash = '#/region/signalwood'`)
      await expect(page.getByRole('heading', { level: 1, name: 'Signalwood' })).toHaveCSS(
        'color',
        rgb('#2f6b3a'),
      )
      // Regions in other moods take that mood's palette instead of the Reach accent.
      await page.evaluate(`location.hash = '#/region/stormwatch'`)
      await expect(page.getByRole('heading', { level: 1, name: 'Stormwatch' })).toBeVisible()
      expect(await page.evaluate<string>('document.documentElement.dataset.mood')).toBe(
        'stormwatch',
      )
      await expectNoA11yViolations(page)
    },
  )

  acTest(
    'E1-02.AC1',
    'a region switch registers no layout shift (Chromium measures it)',
    async ({ page, browserName }) => {
      test.skip(browserName !== 'chromium', 'layout-shift entries are only reported by Chromium')
      await page.addInitScript(`
        window.__cls = 0
        new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__cls += e.value })
          .observe({ type: 'layout-shift', buffered: false })
      `)
      await page.goto('./#/region/harbor')
      await expect(page.getByRole('heading', { level: 1, name: 'The Harbor' })).toBeVisible()
      await page.waitForTimeout(300)
      await page.evaluate(`window.__cls = 0`)
      for (const region of ['chartroom', 'mirror-lake', 'helm-keep', 'signalwood', 'harbor'])
        await page.evaluate(`document.documentElement.dataset.region = '${region}'`)
      await page.waitForTimeout(300)
      expect(await page.evaluate<number>('window.__cls')).toBe(0)
    },
  )

  acTest(
    'E1-02.AC2',
    'in forced-colours mode every control keeps a visible boundary',
    async ({ page, browserName }) => {
      test.skip(
        browserName !== 'chromium',
        'forced-colours emulation is Chromium-only in Playwright',
      )
      await page.emulateMedia({ forcedColors: 'active' })
      // Unreadable progress puts the recovery dialog (with buttons) on the first page.
      await page.addInitScript(`if (!sessionStorage.getItem('seeded')) {
        localStorage.setItem('btg:progress', '{garbage'); sessionStorage.setItem('seeded', '1') }`)
      const check = async (where: string) => {
        const problems = await page.evaluate<string[]>(`(() => {
          const out = []
          const visible = (e) => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden'
          for (const e of document.querySelectorAll('button, input, select, textarea, summary, [role=button], [role=tab]')) {
            if (!visible(e)) continue
            const s = getComputedStyle(e)
            if (s.borderTopStyle === 'none' || parseFloat(s.borderTopWidth) === 0) out.push('no border: ' + e.outerHTML.slice(0, 80))
          }
          for (const a of document.querySelectorAll('a[href]')) {
            if (!visible(a) || a.closest('.sr-only')) continue
            if (!getComputedStyle(a).textDecorationLine.includes('underline')) out.push('not underlined: ' + a.textContent)
          }
          return out
        })()`)
        expect(problems, where).toEqual([])
      }
      await page.goto('./')
      await expect(page.getByRole('dialog')).toBeVisible()
      expect(await page.locator('dialog button').count()).toBeGreaterThan(1)
      await check('recovery dialog')
      await page.keyboard.press('Escape')
      for (const route of ROUTES) {
        await page.goto(route)
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
        await check(route)
      }
      // Focus is drawn in the system highlight colour.
      await page.keyboard.press('Tab')
      const outline = await page.evaluate<string>(
        'getComputedStyle(document.activeElement).outlineStyle',
      )
      expect(outline).toBe('solid')
    },
  )

  acTest(
    'E1-02.AC3',
    'text at 130% causes no clipped or overlapping text on any route at 1280×720',
    async ({ page }, testInfo) => {
      await page.setViewportSize({ width: 1280, height: 720 })
      await withSettings(page, { textSize: 130 })
      for (const route of ROUTES) {
        await page.goto(route)
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
        await expect(page.getByTestId('progress-indicator')).toHaveText(/regions complete/)
        expect(await page.evaluate<string>('document.documentElement.style.fontSize')).toBe('130%')
        const problems = await page.evaluate<string[]>(`(() => {
          const hidden = (n) => { for (let e = n.parentElement; e; e = e.parentElement) {
            const s = getComputedStyle(e); const r = e.getBoundingClientRect()
            if (s.display === 'none' || s.visibility === 'hidden' || (s.overflow === 'hidden' && r.width <= 1 && r.height <= 1)) return true }
            return false }
          const lines = []
          const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
          for (let n = walker.nextNode(); n; n = walker.nextNode()) {
            if (!n.textContent.trim() || hidden(n)) continue
            const range = document.createRange(); range.selectNodeContents(n)
            for (const r of range.getClientRects()) if (r.width > 1 && r.height > 1) lines.push({ n, r, text: n.textContent.trim().slice(0, 30) })
          }
          const out = []
          for (const { n, r, text } of lines) {
            if (r.left < -1 || r.right > innerWidth + 1) out.push('off screen: ' + text)
            // Clipped: text extends past an ancestor that hides overflow.
            for (let e = n.parentElement; e && e !== document.body; e = e.parentElement) {
              const s = getComputedStyle(e)
              if (s.overflowX === 'visible' && s.overflowY === 'visible') continue
              const b = e.getBoundingClientRect()
              if (r.right > b.right + 1 || r.bottom > b.bottom + 1 || r.left < b.left - 1) out.push('clipped: ' + text)
              break
            }
          }
          for (let i = 0; i < lines.length; i++) for (let j = i + 1; j < lines.length; j++) {
            const a = lines[i].r, b = lines[j].r
            if (lines[i].n === lines[j].n) continue
            const w = Math.min(a.right, b.right) - Math.max(a.left, b.left)
            const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
            if (w > 2 && h > 2) out.push('overlap: "' + lines[i].text + '" / "' + lines[j].text + '"')
          }
          return out
        })()`)
        expect(problems, route).toEqual([])
        await testInfo.attach(`130% ${route}`, {
          body: await page.screenshot({ fullPage: true }),
          contentType: 'image/png',
        })
      }
    },
  )

  test('high contrast and reduced motion settings reach the page', async ({ page }) => {
    await withSettings(page, { highContrast: 'on', reduceMotion: 'on' })
    await page.goto('./#/map')
    await expect(page.getByRole('heading', { level: 1, name: 'Map of the Reach' })).toBeVisible()
    expect(await page.evaluate<string>('document.documentElement.dataset.contrast')).toBe('more')
    expect(await page.evaluate<string>('document.documentElement.dataset.motion')).toBe('reduce')
    // Muted text becomes full strength in high contrast.
    await expect(page.locator('ol p').first()).toHaveCSS('color', rgb('#06171a'))
    await expectNoA11yViolations(page)
  })
})
