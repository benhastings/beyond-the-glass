import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { acTest } from '@/test/ac'
import { DASHBOARDS } from '@/sim/dashboards'
import { application } from '@/sim/gitops/argo'
import { telemetryGitopsScenario } from '@/sim/telemetry/testing'
import { DashboardView } from './DashboardView'

afterEach(cleanup)

const H = 3_600_000
const sim = () => {
  const { sim: s } = telemetryGitopsScenario([
    {
      at: '+40m',
      type: 'setMemoryLimit',
      namespace: 'ravenpost',
      deployment: 'ledger',
      container: 'ledger',
      limit: '128Mi',
    },
  ])
  s.advance(H)
  return s
}
const panels = () =>
  screen
    .getAllByRole('region')
    .filter((r) => !r.getAttribute('aria-label')?.startsWith('Dashboard'))

describe('E8-02 dashboards', () => {
  acTest(
    'E8-02.AC1',
    'every panel has a "View as table" toggle and a sentence saying what it shows',
    async () => {
      const s = sim()
      for (const d of DASHBOARDS) {
        render(<DashboardView sim={s} initial={d.id} />)
        const regions = panels()
        expect(regions, d.id).toHaveLength(d.panels.length)
        for (const [i, region] of regions.entries()) {
          const p = d.panels[i]
          if (!p) continue
          // Every panel says what it shows in words.
          const text = region.textContent
          if (p.type === 'timeseries')
            expect(
              within(region).getByRole('figure').querySelector('figcaption')?.textContent,
              p.id,
            ).toMatch(/rose|fell|held steady|No data/)
          else expect(text, p.id).toContain(`${p.title}: `)
          if (p.type === 'logs') continue
          const toggle = within(region).getByRole('button', { name: 'View as table' })
          expect(toggle).toHaveAttribute('aria-pressed', 'false')
          await userEvent.click(toggle)
          expect(toggle).toHaveAttribute('aria-pressed', 'true')
          expect(
            within(region).queryByRole('table') ??
              within(region).getByText('Nothing to show in this time range.'),
          ).toBeInTheDocument()
        }
        cleanup()
      }
    },
    30_000,
  )

  acTest(
    'E8-02.AC2',
    'deploy markers on the panels sit at Argo CD’s sync times',
    () => {
      const s = sim()
      const { container } = render(<DashboardView sim={s} />)
      const history = (application(s, 'gate')?.status.history ?? [])
        .map((h) => h.deployedAt)
        .filter((t) => t >= 0)
      const marked = [...container.querySelectorAll('[data-annotation]')].map((e) =>
        Number(e.getAttribute('data-annotation')),
      )
      const deployPanels = DASHBOARDS[0]?.panels.filter((p) => p.deploys).length ?? 0
      expect(marked.sort((a, b) => a - b)).toEqual(
        history.flatMap((t) => Array<number>(deployPanels).fill(t)).sort((a, b) => a - b),
      )
      expect(
        screen.getAllByText(/Deploys \(dotted lines\): gate synced to [0-9a-f]{7} at \d\d:\d\d/)
          .length,
      ).toBe(deployPanels)
    },
    30_000,
  )

  acTest(
    'E8-02.AC4',
    'the dashboards use no Grafana logos or marks: no images, only text',
    async () => {
      const { container } = render(<DashboardView sim={sim()} />)
      expect(
        container.querySelectorAll('img, picture, object, [style*="background-image"]'),
      ).toHaveLength(0)
      const { readFileSync, readdirSync } = await import('node:fs')
      for (const f of readdirSync('src/app/o11y/dashboards').filter(
        (x) => !x.endsWith('.test.tsx'),
      ))
        expect(readFileSync(`src/app/o11y/dashboards/${f}`, 'utf8'), f).not.toMatch(
          /<img|\.(png|svg|ico)\b|™|®/i,
        )
    },
    30_000,
  )

  it('variables, stats with thresholds, logs, custom ranges and Explore', async () => {
    const s = sim()
    render(<DashboardView sim={s} />)
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Service' }), 'gate')
    expect(
      screen.getByRole('figure', { name: /Requests per second/ }).querySelector('figcaption')
        ?.textContent,
    ).toMatch(/^Requests per second: \{service="gate"\}/)
    await userEvent.click(screen.getByRole('button', { name: 'Explore: Requests per second' }))
    expect(screen.getByRole('combobox', { name: 'PromQL query' })).toHaveValue(
      'sum by (service) (rate(http_server_requests_total{service=~"gate"}[5m]))',
    )
    await userEvent.click(screen.getByRole('button', { name: '← Back to Service Overview (RED)' }))
    // The workloads dashboard: ledger is being OOMKilled since 40 minutes in.
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Dashboard' }),
      'kubernetes-workloads',
    )
    expect(
      screen.getByText(/^Restarts in the last hour: [1-9]\d*, one or more\.$/),
    ).toBeInTheDocument()
    expect(screen.getByRole('meter', { name: 'Closest to its memory limit' })).toHaveAttribute(
      'aria-valuetext',
      '100%',
    )
    expect(
      screen.getByText(/^Closest to its memory limit: 100% of 100%, above 95%\.$/),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/^Deployments with nothing available: 1, one or more\.$/),
    ).toBeInTheDocument()
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Time range' }), 'custom')
    fireEvent.change(screen.getByRole('spinbutton', { name: 'From (minutes ago)' }), {
      target: { value: '90' },
    })
    fireEvent.change(screen.getByRole('spinbutton', { name: 'To (minutes ago)' }), {
      target: { value: '30' },
    })
    expect(screen.getByText(/Showing 19:30–20:30\./)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Dashboard' }),
      'ravenpost-slo',
    )
    expect(screen.getByText(/^Availability \(last hour\): \d/)).toBeInTheDocument()
  }, 30_000)
})
