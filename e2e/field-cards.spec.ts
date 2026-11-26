import { acTest } from './ac.ts'
import { expect, expectNoA11yViolations } from './fixtures.ts'

const CARDS = [
  'kubectl-triage',
  'kubectl-essentials',
  'argocd-essentials',
  'promql-starters',
  'first-five-minutes',
]
const LETTER = { width: 8.5 * 96, height: 11 * 96 }
const MARGIN = 0.4 * 96

acTest(
  'E2-07.AC1',
  'each field card prints on one US Letter page, with nothing cut off',
  async ({ page }) => {
    for (const id of CARDS) {
      await page.goto(`./#/field-cards/${id}`)
      await expect(page.locator(`[data-field-card="${id}"]`)).toBeVisible()
      await page.emulateMedia({ media: 'print' })
      await page.setViewportSize({
        width: Math.round(LETTER.width - 2 * MARGIN),
        height: Math.round(LETTER.height - 2 * MARGIN),
      })
      // In print layout, the card (with its page heading) fits the printable area, and nothing overflows sideways.
      const fit = await page.evaluate<{ height: number; overflow: number }>(`(() => {
      const card = document.querySelector('[data-field-card]')
      const h1 = document.querySelector('h1')
      const top = Math.min(h1.getBoundingClientRect().top, card.getBoundingClientRect().top) + window.scrollY
      const bottom = card.getBoundingClientRect().bottom + window.scrollY
      let overflow = 0
      for (const el of card.querySelectorAll('*')) overflow = Math.max(overflow, el.scrollWidth - el.clientWidth)
      return { height: bottom - top, overflow }
    })()`)
      expect(fit.height, id).toBeLessThanOrEqual(LETTER.height - 2 * MARGIN)
      expect(fit.overflow, id).toBeLessThanOrEqual(1)
      // The real thing: a Letter PDF with one page.
      const pdf = await page.pdf({
        format: 'Letter',
        margin: { top: '0.4in', bottom: '0.4in', left: '0.4in', right: '0.4in' },
        printBackground: false,
      })
      const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length
      expect(pages, id).toBe(1)
      await page.emulateMedia({ media: 'screen' })
    }
  },
)

acTest('E2-07.AC2', 'the field cards are listed, printable, and pass axe', async ({ page }) => {
  await page.goto('./#/field-cards')
  await expect(page.getByRole('heading', { level: 1, name: 'Field cards' })).toBeVisible()
  await expect(page.getByRole('link', { name: /^kubectl triage flow$/ })).toBeVisible()
  await expectNoA11yViolations(page)
  await page.getByRole('link', { name: 'argocd essentials' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'argocd essentials' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Print this card' })).toBeVisible()
  await expectNoA11yViolations(page)
})
