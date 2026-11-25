import { acTest } from './ac.ts'
import { expect, expectNoA11yViolations } from './fixtures.ts'

acTest(
  ['E7-05.AC1', 'E7-05.AC2'],
  'the Argo CD console works by keyboard: open an app, walk the tree, read a pod’s logs, preview a sync',
  async ({ page }) => {
    await page.goto('./#/kitchen-sink')
    const card = page.locator('#argo')
    await card.getByRole('tab', { name: 'Tiles' }).focus()
    await card.getByRole('button', { name: 'Open shop' }).focus()
    await page.keyboard.press('Enter')
    const tree = card.getByRole('tree', { name: 'Resources of shop' })
    await expect(tree).toBeVisible()
    await expect(card.getByRole('heading', { level: 3, name: /shop .*Degraded/ })).toBeVisible()
    await expectNoA11yViolations(page)
    // Into the tree with one Tab stop, then the arrow keys.
    await tree.getByRole('treeitem', { level: 1 }).focus()
    await page.keyboard.press('End')
    await expect(tree.getByRole('treeitem').last()).toBeFocused()
    await page.keyboard.press('Home')
    await expect(tree.getByRole('treeitem', { name: /^Application shop/ })).toBeFocused()
    // A healthy pod of the old ReplicaSet: its logs.
    const healthy = tree.getByRole('treeitem', { name: /^Pod web-\S+ Healthy$/ }).first()
    await healthy.focus()
    await page.keyboard.press('Enter')
    const panel = card.getByRole('region', { name: /^Pod web-/ })
    await expect(panel).toBeFocused()
    await panel.getByRole('tab', { name: 'Summary' }).focus()
    await page.keyboard.press('End')
    await expect(panel.getByRole('tab', { name: 'Logs' })).toBeFocused()
    await expect(panel.getByRole('region', { name: /^Logs of web-/ })).not.toBeEmpty()
    // The broken pod says why.
    await tree
      .getByRole('treeitem', { name: /^Pod web-\S+ Degraded$/ })
      .first()
      .click()
    await card.getByRole('tab', { name: 'Logs' }).click()
    await expect(
      card.getByText(/is waiting to start: trying and failing to pull image/),
    ).toBeVisible()
    await expectNoA11yViolations(page)
    // The table alternative.
    await card.getByRole('tab', { name: 'Tree' }).focus()
    await page.keyboard.press('ArrowRight')
    await expect(
      card
        .getByRole('table', { name: 'Resources of shop' })
        .getByRole('row', { name: /Degraded/ })
        .first(),
    ).toBeVisible()
    // Sync, as a dry run, from the keyboard.
    await card.getByRole('button', { name: 'Sync…' }).focus()
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog', { name: 'Sync shop' })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('checkbox', { name: /Dry run/ }).focus()
    await page.keyboard.press('Space')
    await dialog.getByRole('button', { name: 'Synchronize' }).focus()
    await page.keyboard.press('Enter')
    await expect(dialog.getByText('Dry run: nothing was changed.')).toBeVisible()
    await expectNoA11yViolations(page)
    await page.keyboard.press('Escape')
    await expect(card.getByRole('button', { name: 'Sync…' })).toBeFocused()
  },
)
