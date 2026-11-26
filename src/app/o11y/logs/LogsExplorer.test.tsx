import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { acTest } from '@/test/ac'
import type { LogEntry } from '@/sim/logql/logql'
import { telemetryScenario } from '@/sim/telemetry/testing'
import { ObservabilityWorkspace } from '../ObservabilityWorkspace'
import { LogList } from './LogList'
import { LogsExplorer } from './LogsExplorer'

afterEach(cleanup)

const faulty = () => {
  const { sim } = telemetryScenario([
    { at: '+10m', type: 'injectErrors', namespace: 'ravenpost', service: 'ledger', rate: 0.5 },
  ])
  sim.advance(20 * 60_000)
  return sim
}

describe('E8-04 logs explorer', () => {
  acTest(
    'E8-04.AC2',
    'clicking a trace ID opens that trace with its span selected',
    async () => {
      render(<ObservabilityWorkspace sim={faulty()} />)
      await userEvent.click(screen.getByRole('tab', { name: 'Logs' }))
      const list = screen.getByRole('list', { name: /log lines$/ })
      const link = within(list).getAllByRole('button', {
        name: /^Trace [0-9a-f]{8} for line \d+$/,
      })[0]
      const line = link?.closest('li')?.querySelector('button')
      const text = line?.textContent ?? ''
      if (link) await userEvent.click(link)
      expect(screen.getByRole('tab', { name: 'Traces', selected: true })).toBeInTheDocument()
      const tree = screen.getByRole('tree')
      const selected = within(tree).getByRole('treeitem', { selected: true })
      // The selected span is the one the line came from: same pod's service, and its details are showing.
      const pod = text.split(' ')[1] ?? ''
      expect(selected.textContent).toContain(pod.replace(/-[a-z0-9]+-[a-z0-9]+$/, ''))
      expect(screen.getByRole('region', { name: /^Span / })).toHaveTextContent(
        `resource.k8s.pod.name${pod}`,
      )
      // And back: the span's logs.
      await userEvent.click(screen.getByRole('button', { name: 'Logs for this span' }))
      expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'LogQL query' }).value).toMatch(
        new RegExp(`^\\{pod="${pod}"\\} \\|= "[0-9a-f]{32}"$`),
      )
      expect(screen.getByRole('status')).toHaveTextContent(/^1 line matches/)
    },
    30_000,
  )

  acTest(
    'E8-04.AC3',
    '10,000 lines stay quick (only those in view are rendered) and keep list semantics and the keyboard',
    async () => {
      const entries: LogEntry[] = Array.from({ length: 10_000 }, (_, i) => ({
        t: i * 100,
        labels: {
          cluster: 'prod',
          namespace: 'ravenpost',
          pod: `api-${String(i % 3)}`,
          container: 'api',
          app: 'api',
        },
        line: JSON.stringify({
          level: i % 50 === 0 ? 'error' : 'info',
          msg: `request ${String(i)}`,
        }),
      }))
      const picked: number[] = []
      render(
        <LogList
          entries={entries}
          epochMs={0}
          onSelect={(i) => picked.push(i)}
          label="10,000 log lines"
        />,
      )
      const list = screen.getByRole('list', { name: '10,000 log lines' })
      const items = within(list).getAllByRole('listitem')
      expect(items.length).toBeLessThan(60)
      expect(items[0]).toHaveAttribute('aria-setsize', '10000')
      expect(items[0]).toHaveAttribute('aria-posinset', '1')
      const first = within(items[0] as HTMLElement).getByRole('button')
      expect(first).toHaveAttribute('tabindex', '0')
      first.focus()
      await userEvent.keyboard('{ArrowDown}{ArrowDown}')
      expect(document.activeElement?.closest('li')).toHaveAttribute('aria-posinset', '3')
      await userEvent.keyboard('{End}')
      expect(document.activeElement?.closest('li')).toHaveAttribute('aria-posinset', '10000')
      expect(document.activeElement?.textContent).toContain('request 9999')
      await userEvent.keyboard('{PageUp}{Home}{Enter}')
      expect(document.activeElement?.closest('li')).toHaveAttribute('aria-posinset', '1')
      expect(picked).toEqual([0])
      expect(within(list).getAllByRole('listitem').length).toBeLessThan(60)
    },
  )

  it('shows volume, counts, details and errors', async () => {
    render(<LogsExplorer sim={faulty()} onOpenTrace={() => undefined} />)
    expect(screen.getByRole('status')).toHaveTextContent(/^[\d,]+ lines match, newest first\.$/)
    expect(screen.getByRole('figure', { name: /^Log volume, / })).toHaveTextContent(
      /busiest around \d\d:\d\d, with \d+ lines in 1 minute\./,
    )
    const lines = within(screen.getByRole('list')).getAllByRole('button', { name: /error/ })
    if (lines[0]) await userEvent.click(lines[0])
    const details = screen.getByRole('region', { name: 'Line details' })
    expect(within(details).getByText('level').nextSibling?.textContent).toBe('error')
    expect(
      within(details).getByRole('button', { name: /^Open trace [0-9a-f]{8}$/ }),
    ).toBeInTheDocument()
    const box = screen.getByRole('textbox', { name: 'LogQL query' })
    await userEvent.clear(box)
    await userEvent.type(box, 'count_over_time({{app="api"}[5m]){Enter}')
    expect(screen.getByRole('alert')).toHaveTextContent(
      '"count_over_time(" isn\'t available in this simulation',
    )
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Time range' }), '15m')
  })

  it('latency panels link their slowest sampled requests to the trace view', async () => {
    render(<ObservabilityWorkspace sim={faulty()} />)
    const panel = screen.getByRole('region', { name: 'p99 latency' })
    const exemplar = within(panel).getAllByRole('button', { name: /^Trace [0-9a-f]{8} \(/ })[0]
    if (exemplar) await userEvent.click(exemplar)
    expect(screen.getByRole('tab', { name: 'Traces', selected: true })).toBeInTheDocument()
    expect(screen.getByRole('tree')).toBeInTheDocument()
  }, 30_000)
})
