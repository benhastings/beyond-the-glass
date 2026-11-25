import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { acTest } from '@/test/ac'
import { telemetryScenario } from '@/sim/telemetry/testing'
import { formatValue, unitFor } from './format'
import { PromqlExplorer, seriesName } from './PromqlExplorer'
import { summarize } from './TimeSeriesChart'

afterEach(cleanup)

const sim = () => {
  const { sim: s } = telemetryScenario()
  s.advance(3_600_000)
  return s
}

describe('E8-03 PromQL explorer', () => {
  acTest(
    'E8-03.AC3',
    'the query field is a labelled combobox that autocompletes metric and label names',
    async () => {
      render(<PromqlExplorer sim={sim()} initialQuery="" />)
      const box = screen.getByRole('combobox', { name: 'PromQL query' })
      expect(box).toHaveAttribute('aria-autocomplete', 'list')
      expect(box).toHaveAttribute('aria-expanded', 'false')
      await userEvent.type(box, 'container_m')
      expect(box).toHaveAttribute('aria-expanded', 'true')
      const list = screen.getByRole('listbox', { name: 'Suggestions for PromQL query' })
      expect(
        within(list)
          .getAllByRole('option')
          .map((o) => o.textContent),
      ).toEqual(['container_memory_working_set_bytesgauge'])
      expect(screen.getByText('1 suggestion')).toBeInTheDocument()
      await userEvent.keyboard('{ArrowDown}')
      const opt = within(list).getByRole('option')
      expect(opt).toHaveAttribute('aria-selected', 'true')
      expect(box).toHaveAttribute('aria-activedescendant', opt.id)
      await userEvent.keyboard('{Enter}')
      expect(box).toHaveValue('container_memory_working_set_bytes')
      expect(box).toHaveAttribute('aria-expanded', 'false')
      // Labels too, inside braces; Esc closes the list.
      await userEvent.type(box, '{{nam')
      expect(
        within(screen.getByRole('listbox')).getByRole('option', { name: /namespace/ }),
      ).toBeInTheDocument()
      await userEvent.keyboard('{Escape}')
      expect(box).toHaveAttribute('aria-expanded', 'false')
      await userEvent.type(box, 'espace="ravenpost"}')
      // Enter with nothing chosen runs the query.
      await userEvent.keyboard('{Enter}')
      expect(
        screen.getByRole('figure', {
          name: /Result of container_memory_working_set_bytes\{namespace="ravenpost"\}/,
        }),
      ).toBeInTheDocument()
    },
  )

  it('shows results as a graph with a summary, or as a table; errors quote what isn’t available', async () => {
    const s = sim()
    render(<PromqlExplorer sim={s} />)
    const fig = screen.getByRole('figure')
    expect(within(fig).getByRole('list', { name: 'Legend' })).toHaveTextContent('{service="gate"}')
    expect(fig.querySelector('figcaption')?.textContent).toMatch(/req\/s/)
    await userEvent.click(screen.getByRole('tab', { name: 'Table' }))
    const rows = within(screen.getByRole('table')).getAllByRole('row')
    expect(rows).toHaveLength(7)
    // A starter query loads and runs.
    await userEvent.click(
      screen.getByRole('button', {
        name: 'Run this query: Three containers using the most memory',
      }),
    )
    expect(screen.getByRole('combobox', { name: 'PromQL query' })).toHaveValue(
      'topk(3, container_memory_working_set_bytes)',
    )
    const box = screen.getByRole('combobox', { name: 'PromQL query' })
    await userEvent.clear(box)
    await userEvent.type(box, 'avg_over_time(up[5m]){Enter}')
    expect(screen.getByRole('alert')).toHaveTextContent(
      '"avg_over_time" isn\'t available in this simulation — try',
    )
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Time range' }), '15m')
  })

  it('formats values and names series', () => {
    expect(formatValue(1536, 'bytes')).toBe('1.5 KiB')
    expect(formatValue(0.0123, 'seconds')).toBe('12.3 ms')
    expect(formatValue(2.5, 'seconds')).toBe('2.5 s')
    expect(formatValue(0.05, 'percent')).toBe('5%')
    expect(formatValue(12345)).toBe('12.3K')
    expect(formatValue(Infinity)).toBe('+Inf')
    expect(unitFor('histogram_quantile(0.9, x)')).toBe('seconds')
    expect(unitFor('rate(x[5m])')).toBe('rps')
    expect(seriesName({ __name__: 'up', cluster: 'c', job: 'a' })).toBe('up{job="a"}')
    expect(seriesName({})).toBe('{}')
    expect(summarize([], 'none', 0)).toBe('No data in this time range.')
    expect(
      summarize(
        [
          {
            name: 'p99',
            points: [
              [0, 0.12],
              [60_000, 2.4],
            ],
          },
        ],
        'seconds',
        Date.parse('2026-03-14T21:00:00Z'),
      ),
    ).toBe('p99 rose from 120 ms to 2.4 s (peak 2.4 s at 21:01).')
  })
})
