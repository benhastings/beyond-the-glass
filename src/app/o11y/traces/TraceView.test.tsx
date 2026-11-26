import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { acTest } from '@/test/ac'
import type { Span, Trace } from '@/sim/telemetry/traces'
import { telemetryScenario } from '@/sim/telemetry/testing'
import { TraceExplorer } from './TraceExplorer'
import { sampleTrace } from './sample'
import { TraceView } from './TraceView'

afterEach(cleanup)

const span = (
  id: string,
  service: string,
  name: string,
  parent: string | undefined,
  start: number,
  end: number,
  err = false,
): Span => ({
  traceId: 't',
  spanId: id,
  ...(parent ? { parentSpanId: parent } : {}),
  name,
  kind: 'SPAN_KIND_SERVER',
  start,
  end,
  service,
  namespace: 'ravenpost',
  pod: `${service}-1`,
  attributes: { 'http.route': '/messages' },
  status: err
    ? { code: 'STATUS_CODE_ERROR', message: 'no endpoints' }
    : { code: 'STATUS_CODE_UNSET' },
  events: [],
})
/** gate → api → (ledger → postgres, queue); ledger is the slow one, queue fails. */
const TRACE: Trace = {
  traceId: 'f'.repeat(32),
  rootService: 'gate',
  start: 60_000,
  durationMs: 900,
  error: true,
  spans: [
    span('a', 'gate', 'GET /messages', undefined, 60_000, 60_900),
    span('b', 'api', 'GET /messages', 'a', 60_010, 60_890),
    span('c', 'ledger', 'GET /ledger', 'b', 60_020, 60_820),
    span('d', 'postgres', 'SELECT messages', 'c', 60_030, 60_060),
    span('e', 'queue', 'publish messages', 'b', 60_830, 60_831, true),
  ],
}
const EPOCH = Date.parse('2026-03-14T20:00:00Z')
const name = (el: Element | null | undefined) => {
  if (!el) return ''
  const c = el.cloneNode(true) as Element
  for (const h of c.querySelectorAll('[aria-hidden="true"]')) h.remove()
  return c.textContent.replace(/\s+/g, ' ').trim()
}

describe('E8-05 trace viewer', () => {
  acTest(
    'E8-05.AC1',
    'the waterfall is a WAI-ARIA tree, and the table lists the same spans',
    async () => {
      render(<TraceView trace={TRACE} epochMs={EPOCH} />)
      const tree = screen.getByRole('tree', { name: `Spans of trace ${TRACE.traceId}` })
      const items = within(tree).getAllByRole('treeitem')
      expect(items.map((i) => i.getAttribute('aria-level'))).toEqual(['1', '2', '3', '4', '3'])
      expect(
        items.map(
          (i) =>
            `${String(i.getAttribute('aria-posinset'))}/${String(i.getAttribute('aria-setsize'))}`,
        ),
      ).toEqual(['1/1', '1/1', '1/2', '1/1', '2/2'])
      expect(items.filter((i) => i.tabIndex === 0)).toHaveLength(1)
      expect(name(items[4])).toMatch(/^queue publish messages ● Error 1 ms$/)
      items[0]?.focus()
      await userEvent.keyboard('{ArrowDown}{ArrowDown}{ArrowLeft}')
      expect(within(tree).getAllByRole('treeitem')).toHaveLength(4)
      await userEvent.keyboard('{ArrowLeft}')
      expect(name(document.activeElement)).toMatch(/^api GET \/messages/)
      await userEvent.keyboard('{End}{Enter}')
      expect(
        screen.getByRole('region', { name: 'Span publish messages (queue)' }),
      ).toBeInTheDocument()
      await userEvent.keyboard('{Home}{ArrowRight}')
      // The table: span, service, start offset, duration, status, for every span.
      await userEvent.click(screen.getByRole('tab', { name: 'Table' }))
      const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1)
      expect(
        rows.map((r) =>
          within(r)
            .getAllByRole('cell')
            .map((c) => c.textContent),
        ),
      ).toEqual([
        ['gate', '0 ms', '900 ms', '✓OK'],
        ['api', '10 ms', '880 ms', '✓OK'],
        ['ledger', '20 ms', '800 ms', '✓OK'],
        ['postgres', '30 ms', '30 ms', '✓OK'],
        ['queue', '830 ms', '1 ms', '●Error'],
      ])
    },
  )

  acTest(
    'E8-05.AC2',
    'S jumps to the slowest span and E to the next error, with hints on screen',
    async () => {
      render(<TraceView trace={TRACE} epochMs={EPOCH} />)
      expect(screen.getByText(/Shortcuts: press/)).toHaveTextContent(
        'Shortcuts: press S for the slowest span, E for the next error.',
      )
      const tree = screen.getByRole('tree')
      within(tree).getAllByRole('treeitem')[0]?.focus()
      await userEvent.keyboard('s')
      // ledger spent 770 ms of its own time (800 less postgres' 30): the slowest.
      await expect.poll(() => name(document.activeElement)).toMatch(/^ledger GET \/ledger/)
      expect(screen.getByRole('status')).toHaveTextContent(
        'Slowest span: ledger GET /ledger, 770 ms of its own time.',
      )
      await userEvent.keyboard('e')
      await expect.poll(() => name(document.activeElement)).toMatch(/^queue publish messages/)
      expect(screen.getByRole('status')).toHaveTextContent(
        'Error 1 of 1: queue publish messages: no endpoints.',
      )
      expect(
        screen.getByRole('region', { name: 'Span publish messages (queue)' }),
      ).toHaveTextContent('Error: no endpoints')
      // The same from the buttons; a trace without errors says so.
      cleanup()
      render(
        <TraceView
          trace={{ ...TRACE, spans: TRACE.spans.slice(0, 4), error: false }}
          epochMs={EPOCH}
        />,
      )
      expect(screen.getByRole('button', { name: 'Next error (E)' })).toBeDisabled()
      await userEvent.click(screen.getByRole('button', { name: 'Slowest span (S)' }))
      expect(screen.getByRole('status')).toHaveTextContent(/^Slowest span: ledger/)
    },
  )

  it('renders a 200-span trace with every span in the tree (its speed is checked in a browser: e2e)', () => {
    const r = render(<TraceView trace={sampleTrace(200)} epochMs={EPOCH} />)
    expect(within(r.container).getAllByRole('treeitem')).toHaveLength(200)
  })

  it('the explorer searches, opens a trace at a span, and offers its logs', async () => {
    const { sim } = telemetryScenario([
      { at: '+10m', type: 'injectErrors', namespace: 'ravenpost', service: 'ledger', rate: 0.5 },
    ])
    sim.advance(20 * 60_000)
    const asked: Span[] = []
    render(<TraceExplorer sim={sim} onLogsForSpan={(s) => asked.push(s)} />)
    expect(screen.getByRole('status')).toHaveTextContent(/^\d+ traces match, newest first\.$/)
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Service' }), 'ledger')
    await userEvent.type(screen.getByRole('spinbutton', { name: 'Slower than (ms)' }), '1')
    await userEvent.click(screen.getByRole('button', { name: 'Search' }))
    expect(screen.getByRole('textbox', { name: 'TraceQL' })).toHaveValue(
      '{ resource.service.name = "ledger" && duration >= 1ms }',
    )
    const open = screen.getAllByRole('button', { name: /^Open trace / })[0]
    if (open) await userEvent.click(open)
    expect(
      screen.getByRole('region', { name: /^Span GET \/ledger \(ledger\)$/ }),
    ).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Logs for this span' }))
    expect(asked[0]?.service).toBe('ledger')
    // Unsupported TraceQL says so; a trace ID from elsewhere that doesn't exist too.
    const box = screen.getByRole('textbox', { name: 'TraceQL' })
    await userEvent.clear(box)
    await userEvent.type(box, '{{ status = error } | count() > 1{Enter}')
    expect(screen.getByRole('alert')).toHaveTextContent(
      '"| count(" isn\'t available in this simulation',
    )
    cleanup()
    render(<TraceExplorer sim={sim} open={{ traceId: '0'.repeat(32) }} />)
    expect(screen.getByText(/There’s no trace 0{32} in this simulation\./)).toBeInTheDocument()
  })
})
