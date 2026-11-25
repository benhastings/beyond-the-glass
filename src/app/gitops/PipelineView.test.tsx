import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { acTest } from '@/test/ac'
import { pipelines } from '@/sim/gitops/pipeline'
import { ciScenario } from '@/sim/gitops/testing'
import { duration, PipelineView } from './PipelineView'

/** A failed run (unit tests), part-way through the next stage of nothing: some passed, failed, skipped. */
function failedRun(failure = 'test') {
  const { sim } = ciScenario([{ at: '+1m', type: 'pipeline', project: 'shop-web', failure }])
  sim.advance(15 * 60_000)
  const p = pipelines(sim)[0]
  if (!p) throw new Error('no pipeline')
  return { sim, p }
}

afterEach(cleanup)

describe('E7-02 pipeline view', () => {
  acTest(
    'E7-02.AC1',
    'the list view has the same stages, jobs, statuses and durations as the graph',
    async () => {
      const { sim, p } = failedRun()
      render(<PipelineView pipeline={p} now={sim.now} />)
      const stages = screen.getByRole('list', { name: 'Stages' })
      const graph = within(stages)
        .getAllByRole('button')
        .map((b) => {
          const stage = b.closest('ol > li')?.querySelector('h3')?.textContent ?? ''
          const name = b.querySelector('.font-mono')?.textContent ?? ''
          return [stage.toLowerCase(), name, b.textContent.replace(name, '').trim()].join('|')
        })
      await userEvent.click(screen.getByRole('tab', { name: 'List' }))
      const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1)
      const list = rows.map((r) => {
        const cells = within(r).getAllByRole('cell')
        return [
          cells[0]?.textContent.toLowerCase(),
          within(r).getByRole('rowheader').textContent,
          `${cells[1]?.textContent ?? ''}${cells[2]?.textContent ?? ''}`.trim(),
        ].join('|')
      })
      expect(list).toEqual(graph)
      expect(list).toHaveLength(6)
      expect(list[1]).toMatch(/^test\|unit-tests\|●Failed\d/)
    },
  )

  acTest('E7-02.AC2', 'every status is an icon and a word, never colour alone', () => {
    const { sim, p } = failedRun()
    // One of each: running and created come from a run caught part-way.
    const { sim: s2 } = ciScenario([{ at: '+1m', type: 'pipeline', project: 'shop-web' }])
    s2.advance(90_000)
    const running = pipelines(s2)[0]
    render(
      <>
        <PipelineView pipeline={p} now={sim.now} />
        {running && <PipelineView pipeline={running} now={s2.now} />}
      </>,
    )
    const words = ['Passed', 'Failed', 'Skipped', 'Running', 'Created']
    for (const w of words) {
      const pills = screen.getAllByText(w, { selector: 'span' })
      expect(pills.length, w).toBeGreaterThan(0)
      for (const pill of pills) {
        const icon = pill.querySelector('[aria-hidden="true"]')
        expect(icon?.textContent, w).toMatch(/\S/)
        expect(pill.textContent).toBe(`${icon?.textContent ?? ''}${w}`)
      }
    }
    // Icons differ between passed, failed and running, so the shape tells them apart too.
    const icon = (w: string) =>
      screen.getAllByText(w, { selector: 'span' })[0]?.querySelector('[aria-hidden]')?.textContent
    expect(new Set(['Passed', 'Failed', 'Running'].map(icon)).size).toBe(3)
  })

  it('links the commit, merge request and images, and opens job logs in collapsible sections', async () => {
    const { sim } = ciScenario([
      { at: '+1m', type: 'pipeline', project: 'shop-web', failure: 'bad-tag' },
    ])
    sim.advance(15 * 60_000)
    const p = pipelines(sim)[0]
    if (!p) throw new Error('no pipeline')
    render(<PipelineView pipeline={{ ...p, mr: 7 }} now={sim.now} />)
    expect(screen.getByText(p.sha.slice(0, 8))).toHaveAttribute('title', p.sha)
    expect(screen.getByText('!7')).toBeInTheDocument()
    expect(screen.getByText(`registry.example/web:${p.sha.slice(0, 8)}`)).toBeInTheDocument()
    expect(screen.getByText(`registry.example/web:${p.sha.slice(0, 7)}`)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /update-manifests/ }))
    const log = screen.getByRole('region', { name: 'Log for update-manifests' })
    await expect.poll(() => document.activeElement).toBe(log)
    const sections = log.querySelectorAll('details')
    expect([...sections].map((d) => d.open)).toEqual([false, false, true, false])
    expect(within(log).getByText(/cut -c1-7/)).toBeInTheDocument()
    expect(within(log).getByText('Job succeeded')).toBeInTheDocument()
  })

  it('explains jobs that never ran, and formats durations', async () => {
    const { sim, p } = failedRun('push')
    render(<PipelineView pipeline={p} now={sim.now} />)
    await userEvent.click(screen.getByRole('tab', { name: 'List' }))
    await userEvent.click(screen.getByRole('button', { name: 'View log for update-manifests' }))
    expect(screen.getByText(/Skipped: an earlier stage failed/)).toBeInTheDocument()
    expect(screen.getByText('None yet')).toBeInTheDocument()
    expect([duration(5000), duration(65_000), duration(600_000)]).toEqual([
      '5s',
      '1m 05s',
      '10m 00s',
    ])
  })
})
