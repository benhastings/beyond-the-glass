import { cleanup, render, screen, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { acTest } from '@/test/ac'
import type { Manifest } from '@/content'
import { SCENARIOS } from '@/scenarios'
import { CapstoneRun } from '@/sim/capstone/engine'
import { SIGNALS } from '@/sim/capstone/script'
import { expertNight } from '@/sim/capstone/testing'
import { createShell } from '@/sim/commands'
import { loadSimulation } from '@/sim/controllers'
import { Debrief, practiceNext, strengths } from './Debrief'

const manifest: Manifest = {
  glossary: [],
  regions: [
    {
      id: 'chartroom',
      title: 'The Chartroom',
      summary: 's',
      mood: 'reach',
      estimatedMinutes: 7,
      modules: [
        {
          id: 'first-look',
          regionId: 'chartroom',
          title: 'First look',
          summary: 's',
          domain: 'kubernetes',
          estimatedMinutes: 7,
          lessons: [
            {
              id: 'your-first-look',
              regionId: 'chartroom',
              moduleId: 'first-look',
              title: 'Your first look',
              objectives: ['o'],
              estimatedMinutes: 7,
              domain: 'kubernetes',
              level: 'wayfarer',
              prerequisites: [],
              terms: [],
              steps: [],
              file: 'x.mdx',
              checks: [],
              challenges: [],
            },
          ],
        },
      ],
    },
  ],
}
vi.mock('../content', () => ({ useManifest: () => manifest }))
afterEach(cleanup)

const scenario = SCENARIOS['the-long-night']
if (!scenario) throw new Error('no the-long-night scenario')

const show = (run: CapstoneRun, notes = '') =>
  render(
    <RouterProvider
      router={createMemoryRouter([
        {
          path: '*',
          element: <Debrief run={run} notes={notes} exemplar={scenario.exemplarNote} />,
        },
      ])}
    />,
  )

describe('E10-05 debrief', () => {
  acTest(
    'E10-05.AC1',
    'the debrief reads as linear text: every act, its evidence, the timeline, the notes and practice links, nothing only in a picture',
    () => {
      const run = expertNight(loadSimulation(scenario))
      expect(run.finished).toBe(true)
      show(run, 'paged 21:02; switched to prod')
      const debrief = screen.getByTestId('btg-debrief')
      // No information in pictures: no images or canvases, and any SVG is decoration.
      expect(debrief.querySelectorAll('img, canvas, svg:not([aria-hidden="true"])')).toHaveLength(0)
      const text = debrief.textContent
      for (const [i, act] of run.acts.entries()) {
        const section = screen.getByRole('region', { name: new RegExp(`^Act ${String(i + 1)}: `) })
        expect(section).toHaveTextContent(act.rootCause.replace(/\s+/g, ' ').trim())
        const table = within(section).getByRole('table', { name: 'The evidence, signal by signal' })
        expect(within(table).getAllByRole('row')).toHaveLength(SIGNALS.length + 1)
        for (const sig of SIGNALS)
          expect(table).toHaveTextContent(act.evidence[sig].replace(/\s+/g, ' ').trim())
        const path = within(section).getByRole('list')
        expect(within(path).getAllByRole('listitem')).toHaveLength(act.expertPath.length)
        expect(section).toHaveTextContent('That’s it.')
      }
      // The night in order, with in-world times.
      const items = within(
        screen.getByRole('region', { name: 'The night, minute by minute' }),
      ).getAllByRole('listitem')
      const times = items.map((li) => li.textContent.slice(0, 5))
      expect(times.every((t) => /^\d\d:\d\d$/.test(t))).toBe(true)
      expect([...times].sort()).toEqual(times)
      expect(items[0]).toHaveTextContent('Act 1 began: The pager.')
      expect(text).toContain('You ran kubectl config use-context prod')
      expect(text).toMatch(/You merged !\d+/)
      // Strengths, notes beside the example, and practice links.
      expect(screen.getByRole('region', { name: 'What went well' })).toHaveTextContent(
        'You looked before you changed anything, in every act.',
      )
      const notes = screen.getByRole('region', { name: 'Incident notes' })
      expect(notes).toHaveTextContent('paged 21:02; switched to prod')
      expect(notes).toHaveTextContent('Follow-ups:')
      expect(
        within(screen.getByRole('region', { name: 'Practice next' })).getByRole('link', {
          name: 'Your first look',
        }),
      ).toHaveAttribute('href', '/lesson/your-first-look')
      // Blameless: no grades or numeric scores, and none of the words the tone rules ban.
      expect(text).not.toMatch(/\b(score|grade|simply|just|obviously|easy|trivial)\b/i)
      // What went well is said in words: no percentages or points.
      expect(screen.getByRole('region', { name: 'What went well' }).textContent).not.toMatch(
        /%|points/,
      )
    },
    120_000,
  )

  it('a reckless night: what was missed, what was risky and why, and where to practise', () => {
    const sim = loadSimulation(scenario)
    const run = new CapstoneRun(sim)
    run.start()
    run.idle(6 * 60_000)
    const sh = createShell(sim)
    for (const c of [
      'kubectl delete pods --all',
      'kubectl config use-context prod',
      'kubectl scale deployment gate -n ravenpost --replicas=0',
    ]) {
      sh.run(c)
      run.record(c)
    }
    show(run)
    const act1 = screen.getByRole('region', { name: /^Act 1: / })
    expect(act1).toHaveTextContent(
      'kubectl delete pods --all: Deleting every pod drops all their requests',
    )
    expect(act1).toHaveTextContent('Some changes went to a cluster other than the one in trouble')
    expect(within(act1).getAllByRole('cell', { name: 'Didn’t look here' }).length).toBeGreaterThan(
      3,
    )
    expect(act1).toHaveTextContent('Your answer: not answered.')
    expect(screen.getByRole('region', { name: 'Incident notes' })).toHaveTextContent(
      'You didn’t keep notes this time.',
    )
    expect(screen.getByRole('region', { name: 'What went well' })).toHaveTextContent(
      'You stayed with the incident to the end.',
    )
  })

  it('strengths and practice-next only say what is true', () => {
    const run = expertNight(loadSimulation(scenario))
    const scores = run.scores()
    expect(strengths(scores)).toContain(
      'You fixed every act through Git, so the fix stayed fixed and the next person can see what changed.',
    )
    expect(practiceNext(run.acts, scores)).toEqual(['your-first-look'])
    expect(strengths([])).toEqual([
      'You stayed with the incident to the end. Everything else grows from that.',
    ])
  }, 120_000)
})
