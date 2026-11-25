import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { acTest } from '@/test/ac'
import { createShell } from '@/sim/commands'
import { sync } from '@/sim/gitops/argo'
import { commit } from '@/sim/gitops/git'
import { configManifest, gitopsScenario, webManifest } from '@/sim/gitops/testing'
import { ArgoConsole } from './ArgoConsole'

afterEach(cleanup)

/** An element's accessible name from its content: its text without the aria-hidden icons. */
function nameOf(el: Element | null | undefined): string {
  if (!el) return ''
  const copy = el.cloneNode(true) as Element
  for (const h of copy.querySelectorAll('[aria-hidden="true"]')) h.remove()
  return copy.textContent.replace(/\s+/g, ' ').trim()
}

function healthyShop(automated?: { prune?: boolean; selfHeal?: boolean }) {
  const { sim } = gitopsScenario(automated)
  sync(sim, 'shop')
  sim.advance(5 * 60_000)
  return sim
}
async function openShop() {
  await userEvent.click(screen.getByRole('button', { name: 'Open shop' }))
  return screen.getByRole('tree', { name: 'Resources of shop' })
}

describe('E7-05 Argo CD console', () => {
  acTest(
    'E7-05.AC1',
    'the resource tree follows the WAI-ARIA tree pattern, and the table lists the same nodes',
    async () => {
      const sim = healthyShop()
      render(<ArgoConsole sim={sim} />)
      const tree = await openShop()
      const items = within(tree).getAllByRole('treeitem')
      const nodes = items.map(nameOf)
      // Application, ConfigMap, Deployment, ReplicaSet, 2 Pods.
      expect(items.map((i) => i.getAttribute('aria-level'))).toEqual(['1', '2', '2', '3', '4', '4'])
      expect(items[0]).toHaveAttribute('aria-expanded', 'true')
      expect(items[1]).not.toHaveAttribute('aria-expanded')
      expect(
        items.map(
          (i) =>
            `${String(i.getAttribute('aria-posinset'))}/${String(i.getAttribute('aria-setsize'))}`,
        ),
      ).toEqual(['1/1', '1/2', '2/2', '1/1', '1/2', '2/2'])
      // One tab stop.
      expect(items.filter((i) => i.tabIndex === 0)).toHaveLength(1)
      items[0]?.focus()
      const focused = () => nameOf(document.activeElement)
      await userEvent.keyboard('{ArrowDown}{ArrowDown}')
      expect(focused()).toBe('Deployment web Healthy Synced')
      await userEvent.keyboard('{ArrowLeft}')
      expect(within(tree).getAllByRole('treeitem')).toHaveLength(3)
      expect(document.activeElement).toHaveAttribute('aria-expanded', 'false')
      await userEvent.keyboard('{ArrowRight}{ArrowRight}')
      expect(focused()).toMatch(/^ReplicaSet web-/)
      // Left closes an open branch first, then moves to the parent.
      await userEvent.keyboard('{ArrowLeft}')
      expect(document.activeElement).toHaveAttribute('aria-expanded', 'false')
      await userEvent.keyboard('{ArrowLeft}')
      expect(focused()).toMatch(/^Deployment web/)
      await userEvent.keyboard('{End}')
      expect(focused()).toMatch(/^ReplicaSet web-\S+ Healthy$/)
      await userEvent.keyboard('{Home}')
      expect(focused()).toBe('Application shop Healthy Synced')
      await userEvent.keyboard('{ArrowLeft}')
      expect(within(tree).getAllByRole('treeitem')).toHaveLength(1)
      await userEvent.keyboard('{ArrowRight}{ArrowDown}{Enter}')
      expect(within(tree).getAllByRole('treeitem')[1]).toHaveAttribute('aria-selected', 'true')
      await expect
        .poll(() => document.activeElement?.getAttribute('aria-label'))
        .toBe('ConfigMap web-config')
      // The table alternative: the same nodes, health and sync.
      await userEvent.click(screen.getByRole('tab', { name: 'Table' }))
      const rows = within(screen.getByRole('table', { name: 'Resources of shop' }))
        .getAllByRole('row')
        .slice(1)
      const fromTable = rows.map((r) => {
        const c = within(r).getAllByRole('cell')
        const health = nameOf(c[2])
        const syncText = nameOf(c[3])
        return [
          c[0]?.textContent,
          within(r).getByRole('rowheader').textContent,
          health === '—' ? '' : health,
          syncText === '—' ? '' : syncText,
        ]
          .filter(Boolean)
          .join(' ')
      })
      expect(fromTable).toEqual(nodes)
    },
  )

  acTest(
    'E7-05.AC2',
    'a pod node’s Logs tab shows the same lines as `kubectl logs` for that pod',
    async () => {
      const sim = healthyShop()
      render(<ArgoConsole sim={sim} />)
      const tree = await openShop()
      const pod = within(tree).getAllByRole('treeitem').at(-1)
      const name = nameOf(pod).split(' ')[1] ?? ''
      if (pod) await userEvent.click(pod)
      await userEvent.click(screen.getByRole('tab', { name: 'Logs' }))
      const shown = screen.getByRole('region', { name: `Logs of ${name}` }).textContent
      const k = createShell(sim).run(`kubectl logs ${name} -n shop`)
      expect(shown.length).toBeGreaterThan(0)
      expect(shown).toBe(k.stdout.replace(/\n$/, ''))
    },
  )

  acTest(
    'E7-05.AC3',
    'no Argo CD logos or marks: no images or icons, only the name in text',
    async () => {
      const sim = healthyShop()
      const { container } = render(<ArgoConsole sim={sim} />)
      await openShop()
      expect(
        container.querySelectorAll('img, svg, picture, object, [style*="background-image"]'),
      ).toHaveLength(0)
      const { readFileSync, readdirSync } = await import('node:fs')
      for (const f of readdirSync('src/app/gitops/argo').filter((x) => !x.endsWith('.test.tsx')))
        expect(readFileSync(`src/app/gitops/argo/${f}`, 'utf8'), f).not.toMatch(
          /<img|<svg|\.(png|svg|ico)\b|™|®/i,
        )
      expect(
        readdirSync('public', { recursive: true })
          .map(String)
          .filter((p) => /argo/i.test(p)),
      ).toEqual([])
    },
  )

  it('lists apps as tiles or a list; refreshes; syncs with a dry run first', async () => {
    const sim = healthyShop()
    commit(
      sim,
      'ravenpost-deploy',
      'main',
      { 'shop/web.yaml': webManifest('registry.example/web:2.0'), 'shop/config.yaml': null },
      'Web 2.0, no config',
    )
    render(<ArgoConsole sim={sim} />)
    await userEvent.click(screen.getByRole('tab', { name: 'List' }))
    expect(
      within(screen.getByRole('table', { name: 'Applications' })).getByRole('button', {
        name: 'shop',
      }),
    ).toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: 'Tiles' }))
    await openShop()
    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    expect(screen.getByRole('status', { name: '' })).toHaveTextContent(
      'Refreshed: out of sync with Git.',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Sync…' }))
    const dialog = screen.getByRole('dialog', { name: 'Sync shop' })
    await userEvent.click(within(dialog).getByRole('checkbox', { name: /Prune/ }))
    await userEvent.click(within(dialog).getByRole('checkbox', { name: /Dry run/ }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Synchronize' }))
    expect(within(dialog).getByText('Deployment web: configured')).toBeInTheDocument()
    expect(within(dialog).getByText('ConfigMap web-config: pruned')).toBeInTheDocument()
    expect(sim.cluster().get('ConfigMap', 'shop', 'web-config')).toBeDefined()
    await userEvent.click(within(dialog).getByRole('checkbox', { name: /Dry run/ }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Synchronize' }))
    expect(sim.cluster().get('ConfigMap', 'shop', 'web-config')).toBeUndefined()
    expect(screen.getByText(/^Sync succeeded: successfully synced/)).toBeInTheDocument()
  })

  it('rolls back from history when auto-sync is off, and explains why it can’t when it’s on', async () => {
    const sim = healthyShop()
    commit(
      sim,
      'ravenpost-deploy',
      'main',
      { 'shop/config.yaml': configManifest.replace('calm', 'brisk') },
      'Brisk mode',
    )
    sync(sim, 'shop')
    render(<ArgoConsole sim={sim} />)
    await openShop()
    await userEvent.click(screen.getByRole('button', { name: 'History and rollback' }))
    const dialog = screen.getByRole('dialog', { name: 'History and rollback: shop' })
    expect(within(dialog).getByText('Brisk mode')).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: /^Roll back to 0/ }))
    expect(sim.cluster().get('ConfigMap', 'shop', 'web-config')?.data.MODE).toBe('calm')
    expect(screen.getByText(/^Rolled back to/)).toBeInTheDocument()
    // Node details: the diff now shows Git ahead of the cluster.
    const tree = screen.getByRole('tree', { name: 'Resources of shop' })
    await userEvent.click(within(tree).getByRole('treeitem', { name: /^ConfigMap web-config/ }))
    await userEvent.click(screen.getByRole('tab', { name: 'Diff' }))
    expect(screen.getByText(/MODE: brisk/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: 'Events' }))
    expect(screen.getByText('No events.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '← All applications' }))
    cleanup()
    render(<ArgoConsole sim={healthyShop({ prune: true, selfHeal: true })} />)
    await openShop()
    await userEvent.click(screen.getByRole('button', { name: 'History and rollback' }))
    expect(screen.getByText(/Auto-sync is on, so rollback is turned off/)).toBeInTheDocument()
  })
})
