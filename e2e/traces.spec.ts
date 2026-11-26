import { acTest } from './ac.ts'
import { expect, expectNoA11yViolations } from './fixtures.ts'

acTest(
  ['E8-05.AC1', 'E8-05.AC2'],
  'the trace explorer works from the keyboard: search, open, walk the tree, jump to the slowest and to errors',
  async ({ page }) => {
    await page.goto('./#/kitchen-sink')
    const card = page.locator('#traces')
    await card.getByRole('combobox', { name: 'Service' }).selectOption('ledger')
    await card.getByRole('combobox', { name: 'Status' }).selectOption('error')
    await card.getByRole('button', { name: 'Search' }).focus()
    await page.keyboard.press('Enter')
    await expect(card.getByRole('status').first()).toHaveText(/traces? match/)
    await card
      .getByRole('button', { name: /^Open trace / })
      .first()
      .focus()
    await page.keyboard.press('Enter')
    const tree = card.getByRole('tree')
    await expect(tree).toBeVisible()
    await expectNoA11yViolations(page)
    await tree.getByRole('treeitem').first().focus()
    await page.keyboard.press('End')
    await expect(tree.getByRole('treeitem').last()).toBeFocused()
    await page.keyboard.press('e')
    await expect(card.getByText(/^Error 1 of \d+: /)).toBeVisible()
    await expect(tree.getByRole('treeitem', { name: /● Error/ }).first()).toBeFocused()
    await page.keyboard.press('s')
    await expect(card.getByText(/^Slowest span: /)).toBeVisible()
    await card.getByRole('tab', { name: 'Waterfall' }).focus()
    await page.keyboard.press('ArrowRight')
    await expect(card.getByRole('table', { name: /^Spans of trace / })).toBeVisible()
    await expectNoA11yViolations(page)
  },
)

acTest('E8-05.AC3', 'a 200-span trace renders in under 50 ms in the browser', async ({ page }) => {
  await page.goto('./#/kitchen-sink')
  const button = page.locator('#traces').getByRole('button', { name: 'Show a 200-span trace' })
  await button.scrollIntoViewIfNeeded()
  // From the click to the tree in the DOM (best of three: show, hide, show again).
  const times: number[] = []
  for (let i = 0; i < 3; i++) {
    const ms = await page.evaluate<number>(`(async () => {
      const b = [...document.querySelectorAll('#traces button')].find((x) => /a 200-span trace$/.test(x.textContent))
      const t0 = performance.now()
      b.click()
      const items = '#traces [role="tree"][aria-label="Spans of trace ${'a'.repeat(32)}"] [role="treeitem"]'
      while (document.querySelectorAll(items).length !== 200) await new Promise((r) => setTimeout(r, 0))
      return performance.now() - t0
    })()`)
    times.push(ms)
    await page.locator('#traces').getByRole('button', { name: 'Hide a 200-span trace' }).click()
  }
  expect(Math.min(...times)).toBeLessThan(50)
})
