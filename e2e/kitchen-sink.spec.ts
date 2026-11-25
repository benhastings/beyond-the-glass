import { acTest } from './ac.ts'
import { expect, expectNoA11yViolations, withSettings } from './fixtures.ts'

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
      await expect(page.getByRole('heading', { level: 2, name: region })).toBeVisible()
    await expect(page.getByRole('tablist', { name: 'Depth' })).toBeVisible()
    await expect(page.getByRole('progressbar', { name: 'Lessons in Helm Keep' })).toBeVisible()
    await expect(
      page.getByRole('checkbox', { name: 'Remind me to export my progress' }),
    ).toBeChecked()
    await expect(page.locator('pre[role="region"][aria-label="shell code"]')).toBeVisible()

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
    // A real modal: Tab never reaches the page behind it (after the last control, focus may move to
    // the browser's own UI, which is the native behaviour).
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press('Tab')
      expect(
        await page.evaluate<boolean>(
          `(() => { const a = document.activeElement; return !a || a === document.body || document.querySelector('dialog[open]').contains(a) })()`,
        ),
      ).toBe(true)
    }
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

    // The Tabs demo (the lesson sample has its own depth tabs further down).
    const demo = page.locator('#tabs')
    await demo.getByRole('tab', { name: 'ELI5' }).focus()
    await page.keyboard.press('End')
    await expect(demo.getByRole('tab', { name: 'Deep dive' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await expect(demo.getByRole('tabpanel')).toContainText('share a network namespace')
  },
)

/** For the focused element: its outline, and the contrast between the outline and what's behind it. */
const RING = `(() => {
  const el = document.activeElement
  if (!el || el === document.body) return null
  const ctx = document.createElement('canvas').getContext('2d')
  const rgb = (c) => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = '#000'; ctx.fillStyle = c; ctx.fillRect(0, 0, 1, 1); return [...ctx.getImageData(0, 0, 1, 1).data] }
  const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }
  let bg = null
  for (let e = el.parentElement; e; e = e.parentElement) { const c = rgb(getComputedStyle(e).backgroundColor); if (c[3] === 255) { bg = c; break } }
  bg ??= rgb(getComputedStyle(document.documentElement).backgroundColor)
  const s = getComputedStyle(el)
  const ring = rgb(s.outlineColor)
  const [hi, lo] = [lum(ring), lum(bg)].sort((a, b) => b - a)
  const repeat = el.hasAttribute('data-ring-seen')
  el.setAttribute('data-ring-seen', '')
  const label = el.getAttribute('aria-label') || el.labels?.[0]?.textContent || el.textContent || el.tagName
  return { repeat, name: label.trim().slice(0, 40), style: s.outlineStyle, width: parseFloat(s.outlineWidth), ratio: (hi + 0.05) / (lo + 0.05) }
})()`

acTest(
  'E1-03.AC3',
  'the focus ring is visible on every interactive element in every mood, at 3:1 or more',
  async ({ page }) => {
    await page.goto('./#/kitchen-sink')
    await expect(page.getByRole('heading', { level: 1, name: 'Kitchen sink' })).toBeVisible()
    for (const [label, mood] of MOODS) {
      await page.getByRole('radio', { name: label }).check()
      await expect(page.locator('html')).toHaveAttribute('data-mood', mood)
      // Start from the top of the page and Tab through everything.
      await page.evaluate(
        `document.querySelectorAll('[data-ring-seen]').forEach((e) => e.removeAttribute('data-ring-seen'))`,
      )
      await page.locator('body').click({ position: { x: 1, y: 1 } })
      const seen = new Set<string>()
      const problems: string[] = []
      for (let i = 0; i < 80; i++) {
        await page.keyboard.press('Tab')
        const r = await page.evaluate<{
          repeat: boolean
          name: string
          style: string
          width: number
          ratio: number
        } | null>(RING)
        if (!r) continue
        if (r.repeat) break
        seen.add(r.name)
        if (r.style === 'none' || r.width < 2)
          problems.push(`${mood}: no visible ring on "${r.name}"`)
        else if (r.ratio < 3)
          problems.push(`${mood}: ring on "${r.name}" is ${r.ratio.toFixed(2)}:1`)
      }
      expect(seen.size, `${mood}: interactive elements reached`).toBeGreaterThan(15)
      expect(problems).toEqual([])
    }
  },
)

acTest(
  'E6-08.AC1',
  'kubectl edit’s editor works from the keyboard alone and passes axe',
  async ({ page }) => {
    await page.goto('./#/kitchen-sink')
    const run = page.getByRole('button', { name: 'Run kubectl edit configmap ravenpost-config' })
    await run.focus()
    await page.keyboard.press('Enter')
    const area = page.getByRole('textbox', { name: 'YAML for configmap/ravenpost-config' })
    await expect(area).toBeFocused()
    await expectNoA11yViolations(page)
    // Edit, then Tab to Save and press Enter.
    await page.keyboard.press('Control+End')
    await area.press('Control+Home')
    const text = await area.inputValue()
    await area.fill(text.replace('LOG_LEVEL: info', 'LOG_LEVEL: debug'))
    await page.keyboard.press('Tab')
    await expect(page.getByRole('button', { name: 'Save' })).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.getByLabel('Command output')).toContainText(
      'configmap/ravenpost-config edited',
    )
    // A broken edit reopens with the error announced; Escape then cancels.
    await run.focus()
    await page.keyboard.press('Enter')
    await area.fill('apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: ravenpost-config\n bad: [')
    await page.keyboard.press('Control+s')
    await expect(page.getByRole('alert')).toContainText(/Not saved\. Line \d+:/)
    await expect(area).toBeFocused()
    await expectNoA11yViolations(page)
    await page.keyboard.press('Escape')
    await expect(page.getByLabel('Command output')).toHaveText('Edit cancelled, no changes made.')
    await expect(run).toBeVisible()
  },
)

acTest(
  'E6-09.AC3',
  'the terminal’s history and scrollback come back after a reload',
  async ({ page }) => {
    await page.goto('./#/kitchen-sink')
    const input = page.locator('#terminal').getByRole('textbox', { name: 'Command' })
    await input.fill('kubectl get pods -n ravenpost')
    await input.press('Enter')
    await input.fill('pwd')
    await input.press('Enter')
    const log = page.getByRole('log', { name: 'Ravenpost terminal output' })
    await expect(log.getByRole('heading', { level: 3 })).toHaveCount(2)
    await page.reload()
    await expect(log.getByRole('heading', { level: 3 })).toHaveCount(2)
    await expect(log).toContainText('ravenpost-notifier')
    await input.focus()
    await input.press('ArrowUp')
    await expect(input).toHaveValue('pwd')
    await input.press('ArrowUp')
    await expect(input).toHaveValue('kubectl get pods -n ravenpost')
  },
)

acTest(
  'E6-09.AC4',
  'at 130% text the terminal scrolls within itself and the page never scrolls sideways',
  async ({ page }) => {
    await withSettings(page, { textSize: 130 })
    await page.setViewportSize({ width: 375, height: 800 })
    await page.goto('./#/kitchen-sink')
    expect(await page.evaluate<string>('document.documentElement.style.fontSize')).toBe('130%')
    const input = page.locator('#terminal').getByRole('textbox', { name: 'Command' })
    await input.fill('kubectl get pods -A -o wide')
    await input.press('Enter')
    const out = page.locator('#terminal').getByLabel(/^Output of kubectl get pods -A -o wide/)
    await expect(out).toBeVisible()
    // The wide table is wider than the screen, so the output scrolls, not the page.
    expect(
      await out.evaluate(
        (el: { scrollWidth: number; clientWidth: number }) => el.scrollWidth > el.clientWidth,
      ),
    ).toBe(true)
    expect(
      await page.evaluate<boolean>('document.documentElement.scrollWidth <= window.innerWidth'),
    ).toBe(true)
    // The touch helper row is there on a phone-sized screen.
    await expect(
      page.locator('#terminal').getByRole('group', { name: 'Terminal keys' }),
    ).toBeVisible()
    await expectNoA11yViolations(page)
  },
)
