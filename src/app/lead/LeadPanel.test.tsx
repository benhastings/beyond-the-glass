import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, vi } from 'vitest'
import { acTest } from '@/test/ac'
import type { Manifest } from '@/content'
import { emptyProgress, encodeProgress, type Progress } from '@/progress'
import { LeadPanel, readCodes } from './LeadPanel'

const MANIFEST: Manifest = {
  glossary: [],
  regions: [
    {
      id: 'harbor',
      title: 'Harbor',
      summary: 's',
      mood: 'reach',
      estimatedMinutes: 5,
      modules: [
        {
          id: 'm',
          regionId: 'harbor',
          title: 'M',
          summary: 's',
          domain: 'containers',
          estimatedMinutes: 5,
          lessons: [
            {
              id: 'h1',
              regionId: 'harbor',
              moduleId: 'm',
              title: 'H',
              objectives: ['o'],
              estimatedMinutes: 5,
              domain: 'containers',
              level: 'wayfarer',
              prerequisites: [],
              terms: [],
              steps: [],
              file: 'h.mdx',
              checks: [],
              challenges: [],
            },
          ],
        },
      ],
    },
    {
      id: 'stormwatch',
      title: 'Stormwatch',
      summary: 's',
      mood: 'stormwatch',
      estimatedMinutes: 5,
      modules: [
        {
          id: 'cap',
          regionId: 'stormwatch',
          title: 'C',
          summary: 's',
          domain: 'observability',
          estimatedMinutes: 5,
          lessons: [
            {
              id: 's1',
              regionId: 'stormwatch',
              moduleId: 'cap',
              title: 'S',
              objectives: ['o'],
              estimatedMinutes: 5,
              domain: 'observability',
              level: 'pathfinder',
              prerequisites: [],
              terms: [],
              steps: [],
              file: 's.mdx',
              checks: [],
              challenges: [],
            },
          ],
        },
      ],
    },
  ],
}
vi.mock('../content', () => ({ useManifest: () => MANIFEST }))

const learner = (
  name: string,
  level: 'wayfarer' | 'navigator',
  done: string[],
  at: string,
): Progress => ({
  ...emptyProgress(at),
  updatedAt: at,
  displayName: name,
  threshold: {
    answers: {},
    overrides: {},
    placement: { kubernetes: level, containers: level },
    completedAt: at,
  },
  lessons: Object.fromEntries(
    done.map((id) => [id, { currentStep: 0, completedSteps: [], completedAt: at }]),
  ),
})
const code = (p: Progress) => encodeProgress(p, { compress: false })

describe('E3-05 lead view', () => {
  acTest('E3-05.AC1', 'reads 20 codes in under a second', async () => {
    const codes = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        code(learner(`L${String(i)}`, 'wayfarer', ['h1'], '2026-11-20T10:00:00.000Z')),
      ),
    )
    const t0 = performance.now()
    const r = await readCodes(codes.join('\n'), MANIFEST, '2026-11-25T10:00:00.000Z')
    expect(performance.now() - t0).toBeLessThan(1000)
    expect(r.rows).toHaveLength(20)
    expect(r.rows[0]?.summary.regionsCompleted).toEqual(['harbor'])
  })

  acTest(
    'E3-05.AC2',
    'bad lines are reported by line number without blocking the good ones',
    async () => {
      const good = await code(learner('Ada', 'navigator', [], '2026-11-24T10:00:00.000Z'))
      const r = await readCodes(
        `${good}\nnot a code\n\nBTG1.broken\n${good}`,
        MANIFEST,
        '2026-11-25T10:00:00.000Z',
      )
      expect(r.rows.map((x) => x.line)).toEqual([1, 5])
      expect(r.errors.map((e) => e.line)).toEqual([2, 4])
      expect(r.errors[0]?.error).toBeTruthy()
    },
  )

  acTest('E3-05.AC3', 'a real table with headers, sortable from the keyboard', async () => {
    const codes = [
      await code(learner('Zoe', 'wayfarer', ['h1', 's1'], '2026-11-21T10:00:00.000Z')),
      await code(learner('Ada', 'navigator', [], '2026-11-24T10:00:00.000Z')),
      'garbage',
    ]
    const user = userEvent.setup()
    render(<LeadPanel />)
    await user.type(screen.getByRole('textbox', { name: 'Progress codes, one per line' }), 'x')
    await user.clear(screen.getByRole('textbox', { name: 'Progress codes, one per line' }))
    await user.click(screen.getByRole('textbox', { name: 'Progress codes, one per line' }))
    await user.paste(codes.join('\n'))
    await user.click(screen.getByRole('button', { name: 'Show progress' }))
    const table = await screen.findByRole('table', { name: /Learners’ progress/ })
    expect(screen.getByRole('status')).toHaveTextContent('2 learners; 1 line couldn’t be read.')
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((h) => h.textContent),
    ).toEqual([
      'Name ▲',
      'Foundations',
      'Containers',
      'Kubernetes',
      'Delivery',
      'Observability',
      'Regions complete',
      'Modules tested out',
      'Capstone',
      'Last activity',
    ])
    const names = () =>
      within(table)
        .getAllByRole('rowheader')
        .map((h) => h.textContent)
    expect(names()).toEqual(['Ada', 'Zoe'])
    expect(within(table).getAllByRole('row')[2]).toHaveTextContent(
      'Zoe–WayfarerWayfarer––2 of 20complete2026-11-21',
    )
    // Keyboard: Tab to a heading button, Enter sorts; Enter again reverses.
    const regions = within(table).getByRole('button', { name: /Regions complete/ })
    regions.focus()
    await user.keyboard('{Enter}')
    expect(regions.closest('th')).toHaveAttribute('aria-sort', 'ascending')
    expect(names()).toEqual(['Ada', 'Zoe'])
    await user.keyboard('{Enter}')
    expect(regions.closest('th')).toHaveAttribute('aria-sort', 'descending')
    expect(names()).toEqual(['Zoe', 'Ada'])
    expect(screen.getByRole('button', { name: 'Print summary' })).toBeInTheDocument()
  })
})
