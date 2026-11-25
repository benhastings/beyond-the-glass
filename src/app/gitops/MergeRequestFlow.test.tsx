import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { acTest } from '@/test/ac'
import { mrScenario, webManifest, webWithLimit } from '@/sim/gitops/testing'
import { announce, DiffView } from './DiffView'
import { MergeRequestFlow } from './MergeRequestFlow'

afterEach(cleanup)

describe('E7-03 merge request flow', () => {
  acTest(
    'E7-03.AC2',
    'the diff is a real unified diff, and each changed line is announced in words',
    () => {
      const before = webManifest('registry.example/web:1.0')
      const after = webWithLimit('registry.example/web:1.0', '512Mi')
      render(<DiffView before={before} after={after} label="Changes to shop/web.yaml" />)
      const region = screen.getByRole('region', { name: 'Changes to shop/web.yaml' })
      expect(within(region).getByRole('status')).toHaveTextContent('3 lines added, 0 removed.')
      const items = within(region).getAllByRole('listitem')
      // A hunk header, three lines of context, then the additions: + markers and both line-number gutters.
      expect(items[0]?.textContent).toMatch(/^@@ -14,3 \+14,6 @@/)
      const memory = items.find((li) => li.textContent.includes('memory: 512Mi'))
      expect(within(memory as HTMLElement).getByText('added line 19: memory: 512Mi')).toHaveClass(
        'sr-only',
      )
      expect(memory?.querySelector('[aria-hidden="true"].font-bold')?.textContent).toBe('+')
      expect(announce('-', 7, '  replicas: 2')).toBe('removed line 7: replicas: 2')
      cleanup()
      render(<DiffView before="a\n" after="a\n" label="None" />)
      expect(screen.getByRole('status')).toHaveTextContent('No changes yet.')
    },
  )

  it('edits, opens a merge request, fails policy, pushes a fix, merges, and watches Argo CD sync it', async () => {
    const { sim } = mrScenario()
    sim.advance(180_000)
    render(
      <MergeRequestFlow sim={sim} repo="ravenpost-deploy" files={['shop/web.yaml']} app="shop" />,
    )
    const editor = screen.getByRole('textbox', { name: /Edit shop\/web\.yaml/ })
    // Nothing changed: it says so.
    await userEvent.click(screen.getByRole('button', { name: 'Commit and open merge request' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Change the file first')
    fireEvent.change(editor, { target: { value: webManifest('registry.example/web:1.1') } })
    expect(screen.getByText('1 line added, 1 removed.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Commit and open merge request' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Write a commit message')
    await userEvent.type(screen.getByRole('textbox', { name: 'Commit message' }), 'Web 1.1{Enter}')
    expect(screen.getByRole('heading', { name: /Merge request !1: Web 1\.1/ })).toBeInTheDocument()
    expect(screen.getByText(/Opened merge request !1 from you\/web/)).toBeInTheDocument()
    expect(screen.getByText(/is still running\. Merging waits/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Merge' }))
    expect(screen.getByText(/^Not merged yet\./)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Wait for the pipeline' }))
    expect(screen.getByText(/^Pipeline #\d+ failed\.$/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /policy-check/ }))
    expect(screen.getByText(/has no memory limit/)).toBeInTheDocument()
    // Fix it on the same branch.
    await userEvent.click(screen.getByRole('button', { name: 'Edit and push a fix' }))
    expect(screen.getByRole('heading', { name: 'Push a fix to !1' })).toBeInTheDocument()
    fireEvent.change(screen.getByRole('textbox', { name: /Edit shop\/web\.yaml/ }), {
      target: { value: webWithLimit('registry.example/web:1.1') },
    })
    await userEvent.type(screen.getByRole('textbox', { name: 'Commit message' }), 'Limit memory')
    await userEvent.click(screen.getByRole('button', { name: 'Commit and push' }))
    await userEvent.click(screen.getByRole('button', { name: 'Wait for the pipeline' }))
    expect(screen.getByText('Ready to merge: the pipeline passed.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Merge' }))
    expect(
      screen.getByText(/^Merged into main as [0-9a-f]{8}\. Argo CD will notice it/),
    ).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Watch Argo CD' }))
    expect(screen.getByText(/^Argo CD synced [0-9a-f]{8}\.$/)).toBeInTheDocument()
    expect(
      screen.getByText('Argo CD has synced your merge: the cluster now runs what Git says.'),
    ).toBeInTheDocument()
    expect(
      sim.cluster().get('Deployment', 'shop', 'web')?.spec.template.spec.containers[0]?.resources
        ?.limits?.memory,
    ).toBe('256Mi')
    await userEvent.click(screen.getByRole('button', { name: 'Start another change' }))
    expect(screen.getByRole('heading', { name: 'Change a manifest' })).toBeInTheDocument()
  })
})
