import { acTest } from './ac.ts'
import { expect, expectNoA11yViolations } from './fixtures.ts'

const IMAGE_10 = 'image: registry.example/web:1.0'

acTest(
  ['E7-03.AC1', 'E7-03.AC2'],
  'the merge request flow, start to finish, from the keyboard alone',
  async ({ page }) => {
    await page.goto('./#/kitchen-sink')
    const card = page.locator('#merge-request')
    const editor = card.getByRole('textbox', { name: /Edit shop\/web\.yaml/ })
    await editor.focus()
    // Change the tag by keyboard: select the whole file and type it back with 1.1.
    const original = await editor.inputValue()
    await page.keyboard.press('ControlOrMeta+a')
    await page.keyboard.insertText(original.replace(IMAGE_10, 'image: registry.example/web:1.1'))
    await expect(card.getByText('1 line added, 1 removed.')).toBeVisible()
    await expect(
      card.getByText(/^added line \d+: image: registry\.example\/web:1\.1$/),
    ).toBeAttached()
    await expectNoA11yViolations(page)
    await page.keyboard.press('Tab')
    await expect(card.getByRole('group', { name: /: lines$/ })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(card.getByRole('textbox', { name: 'Commit message' })).toBeFocused()
    await page.keyboard.type('Move web to 1.1')
    await page.keyboard.press('Enter')
    const heading = card.getByRole('heading', { name: /Merge request !1: Move web to 1\.1/ })
    await expect(heading).toBeFocused()
    // The pipeline runs; it fails the memory-limit policy.
    await card.getByRole('button', { name: 'Wait for the pipeline' }).focus()
    await page.keyboard.press('Enter')
    await expect(card.getByText(/^Pipeline #\d+ failed\.$/)).toBeVisible()
    await card.getByRole('button', { name: /policy-check/ }).focus()
    await page.keyboard.press('Enter')
    await expect(card.getByRole('region', { name: 'Log for policy-check' })).toContainText(
      'has no memory limit',
    )
    await expectNoA11yViolations(page)
    // Push a fix to the same branch.
    await card.getByRole('button', { name: 'Edit and push a fix' }).focus()
    await page.keyboard.press('Enter')
    await expect(editor).toBeFocused()
    const current = await editor.inputValue()
    await page.keyboard.press('ControlOrMeta+a')
    await page.keyboard.insertText(
      `${current.trimEnd()}\n          resources:\n            limits:\n              memory: 256Mi\n`,
    )
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')
    await page.keyboard.type('Limit web memory to 256Mi')
    await page.keyboard.press('Enter')
    await card.getByRole('button', { name: 'Wait for the pipeline' }).focus()
    await page.keyboard.press('Enter')
    await expect(card.getByText('Ready to merge: the pipeline passed.')).toBeVisible()
    await card.getByRole('button', { name: 'Merge' }).focus()
    await page.keyboard.press('Enter')
    await expect(card.getByText(/^Merged into main as [0-9a-f]{8}/)).toBeVisible()
    await card.getByRole('button', { name: 'Watch Argo CD' }).focus()
    await page.keyboard.press('Enter')
    await expect(
      card.getByText('Argo CD has synced your merge: the cluster now runs what Git says.'),
    ).toBeVisible()
    await expectNoA11yViolations(page)
  },
)
