import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { telemetryScenario } from '@/sim/telemetry/testing'
import { ObservabilityWorkspace } from '../ObservabilityWorkspace'

afterEach(cleanup)

describe('E8-07 alerts, SLOs and the pager', () => {
  it('pages for a ledger outage, shows the rules and the SLO burn, and acknowledges', async () => {
    const { sim } = telemetryScenario([
      {
        at: '+40m',
        type: 'setMemoryLimit',
        namespace: 'ravenpost',
        deployment: 'ledger',
        container: 'ledger',
        limit: '128Mi',
      },
    ])
    sim.advance(60 * 60_000)
    render(<ObservabilityWorkspace sim={sim} />)
    const pager = screen.getByRole('alert')
    expect(pager).toHaveTextContent(/^●Paged: .*RavenpostHighErrorRate \(firing since 20:4\d\)/)
    expect(pager).toHaveTextContent(/KubeDeploymentReplicasUnavailable/)
    await userEvent.click(within(pager).getByRole('button', { name: 'See alerts' }))
    expect(screen.getByRole('tab', { name: 'Alerts', selected: true })).toBeInTheDocument()
    const rules = screen.getByRole('region', { name: 'Alerts' })
    const err = within(rules).getByText('RavenpostHighErrorRate').closest('li') as HTMLElement
    expect(within(err).getByText('Firing')).toBeInTheDocument()
    expect(
      within(err).getByText(/^Firing since 20:4\d for service=gate \(value \d/),
    ).toBeInTheDocument()
    const lat = within(rules).getByText('RavenpostHighLatency').closest('li') as HTMLElement
    expect(within(lat).getByText(/^(Inactive|Pending|Firing)$/)).toBeInTheDocument()
    await userEvent.click(within(err).getByText('Rule, runbook and history'))
    expect(
      within(err).getByText('runbooks.ravenpost.example/RavenpostHighErrorRate'),
    ).toBeInTheDocument()
    expect(
      within(err).getByRole('list', { name: 'RavenpostHighErrorRate: changes in the last hour' }),
    ).toHaveTextContent(/inactive → pending.*pending → firing/)
    // The SLO: the outage burns the budget far faster than 14.4×.
    const slo = screen.getByRole('region', { name: 'Service level objectives' })
    expect(within(slo).getByText('Burning fast enough to page')).toBeInTheDocument()
    const fiveMin = within(within(slo).getByRole('table')).getByRole('row', { name: /Last 5m/ })
    expect(Number(/([\d.]+)×/.exec(fiveMin.textContent)?.[1])).toBeGreaterThan(14.4)
    await userEvent.click(within(slo).getByRole('tab', { name: 'Operator' }))
    expect(within(slo).getByText(/Burn rate = error ratio ÷ budget/)).toBeInTheDocument()
    // Acknowledged: the banner goes.
    await userEvent.click(
      within(screen.getByRole('alert')).getByRole('button', { name: 'Acknowledge' }),
    )
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  }, 30_000)

  it('a healthy system: no page, every rule inactive, within budget', async () => {
    const { sim } = telemetryScenario()
    sim.advance(60 * 60_000)
    render(<ObservabilityWorkspace sim={sim} />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: 'Alerts' }))
    expect(screen.getAllByText('Inactive')).toHaveLength(5)
    expect(
      screen.getByText(/^(Within budget pace|Faster than planned, below the paging thresholds)$/),
    ).toBeInTheDocument()
  }, 30_000)
})
