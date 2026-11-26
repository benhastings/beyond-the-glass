import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect } from 'vitest'
import { acTest } from '@/test/ac'
import { NODES } from '@/sim/otel/pipeline'
import OtelPipeline from './OtelPipeline'

afterEach(cleanup)

const stored = () => screen.getByRole('region', { name: 'What reaches the trace store' })
const rows = () =>
  within(stored()).queryByRole('table')
    ? within(within(stored()).getByRole('table')).getAllByRole('row').slice(1)
    : []

describe('E8-06 OpenTelemetry pipeline explainer', () => {
  acTest(
    'E8-06.AC1',
    'each switch’s effect shows in the mini trace view and is described in words',
    async () => {
      render(<OtelPipeline />)
      expect(within(stored()).getByRole('status')).toHaveTextContent(
        '100 traces from the last 100 requests.',
      )
      expect(rows()[0]?.textContent).toMatch(
        /gate → api → ledgergate-6c9f7d-2xk4p, api-5d8b9c-q7m2n, ledger-7f6d5b-h3j8k$/,
      )
      const yaml = () => screen.getByRole('region', { name: /yaml/ }).textContent
      // No context propagation: each service's span is its own trace.
      await userEvent.click(screen.getByRole('checkbox', { name: /passes trace context/ }))
      expect(within(stored()).getByRole('status')).toHaveTextContent(
        /^300 traces from the last 100 requests\..*traceparent/,
      )
      expect(
        rows()
          .slice(0, 3)
          .map((r) => r.querySelectorAll('td')[0]?.textContent),
      ).toEqual(['gate', 'api', 'ledger'])
      await userEvent.click(screen.getByRole('checkbox', { name: /passes trace context/ }))
      // No k8sattributes: no pods; and it leaves the config.
      await userEvent.click(screen.getByRole('checkbox', { name: /k8sattributes/ }))
      expect(rows()[0]?.textContent).toMatch(/no pod, no pod, no pod$/)
      expect(within(stored()).getByRole('status')).toHaveTextContent(/no pod or namespace/)
      expect(yaml()).not.toContain('k8sattributes')
      await userEvent.click(screen.getByRole('checkbox', { name: /k8sattributes/ }))
      // 1% sampling: one trace in a hundred.
      await userEvent.click(screen.getByRole('radio', { name: 'One in a hundred (1%)' }))
      expect(within(stored()).getByRole('status')).toHaveTextContent(
        /^1 trace from the last 100 requests\.Only 1 of the last 100 requests were kept/,
      )
      expect(yaml()).toContain('probabilistic_sampler')
      await userEvent.click(screen.getByRole('radio', { name: 'All of them (100%)' }))
      // A wrong exporter: nothing at all, and the Collector says so.
      await userEvent.click(screen.getByRole('checkbox', { name: /points at the trace store/ }))
      expect(within(stored()).getByRole('status')).toHaveTextContent(
        /^No traces from the last 100 requests\..*misspelled/,
      )
      expect(
        within(stored()).getByText(/^error\s+exporterhelper.*Exporting failed\. Dropping data\./),
      ).toBeInTheDocument()
      expect(rows()).toEqual([])
      expect(yaml()).toContain('tempo.observabilty.svc')
      expect(
        screen.getByRole('button', { name: /Exporters ● traces exporter can’t connect/ }),
      ).toBeInTheDocument()
    },
  )

  acTest(
    'E8-06.AC2',
    'the diagram is keyboard navigable, and every node describes what it does',
    async () => {
      render(<OtelPipeline />)
      const flow = screen.getByRole('list', { name: 'The pipeline, in the order data flows' })
      const nodes = within(flow).getAllByRole('button')
      expect(nodes).toHaveLength(NODES.length)
      expect(nodes.filter((n) => n.tabIndex === 0)).toHaveLength(1)
      for (const [i, n] of nodes.entries()) expect(n).toHaveAccessibleDescription(NODES[i]?.detail)
      nodes[0]?.focus()
      await userEvent.keyboard('{ArrowRight}{ArrowRight}')
      expect(document.activeElement).toBe(nodes[2])
      expect(nodes[2]).toHaveAttribute('aria-current', 'step')
      expect(screen.getByText(/^Receivers:/).closest('p')).toHaveTextContent(
        `Receivers: ${NODES[2].detail}`,
      )
      await userEvent.keyboard('{End}')
      expect(document.activeElement).toBe(nodes.at(-1))
      await userEvent.keyboard('{ArrowLeft}{Home}')
      expect(document.activeElement).toBe(nodes[0])
    },
  )
})
