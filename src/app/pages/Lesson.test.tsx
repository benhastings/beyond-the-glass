import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { beforeEach, describe, expect, vi } from 'vitest'
import { acTest } from '@/test/ac'
import type { Manifest } from '@/content'
import { useProgress } from '../progress'
import Lesson from './Lesson'

/** A two-lesson manifest: "basics" has three steps, a required check and an optional one. */
const MANIFEST: Manifest = {
  glossary: [],
  regions: [
    {
      id: 'chartroom',
      title: 'The Chartroom',
      summary: 's',
      mood: 'reach',
      estimatedMinutes: 20,
      modules: [
        {
          id: 'm',
          regionId: 'chartroom',
          title: 'M',
          summary: 's',
          domain: 'kubernetes',
          estimatedMinutes: 20,
          lessons: [
            {
              id: 'basics',
              regionId: 'chartroom',
              moduleId: 'm',
              title: 'Basics',
              objectives: ['List pods', 'Read a pod’s events'],
              estimatedMinutes: 10,
              domain: 'kubernetes',
              level: 'wayfarer',
              prerequisites: [],
              terms: [],
              steps: [{ id: 'one', title: 'Look' }, { id: 'two', title: 'Read' }, { id: 'three' }],
              file: 'regions/chartroom/m/basics.mdx',
              checks: [
                {
                  id: 'must',
                  type: 'single',
                  prompt: 'Required question?',
                  explanation: 'e',
                  required: true,
                  options: [
                    { id: 'yes', text: 'Yes', correct: true },
                    { id: 'no', text: 'No', correct: false },
                  ],
                },
                {
                  id: 'optional',
                  type: 'single',
                  prompt: 'Optional question?',
                  explanation: 'e',
                  required: false,
                  options: [
                    { id: 'yes', text: 'Yes', correct: true },
                    { id: 'no', text: 'No', correct: false },
                  ],
                },
              ],
              challenges: [],
            },
            {
              id: 'next-one',
              regionId: 'chartroom',
              moduleId: 'm',
              title: 'The next one',
              objectives: ['o'],
              estimatedMinutes: 10,
              domain: 'kubernetes',
              level: 'wayfarer',
              prerequisites: [],
              terms: [],
              steps: [],
              file: 'regions/chartroom/m/next-one.mdx',
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
vi.mock('../lesson/load', async () => {
  const { Step } = await import('../lesson/components/Step')
  const { Check } = await import('../lesson/components/Check')
  const Body = () => (
    <>
      <Step id="one" title="Look">
        <p>Step one text</p>
      </Step>
      <Step id="two" title="Read">
        <p>Step two text</p>
        <Check id="optional" />
      </Step>
      <Step id="three">
        <p>Step three text</p>
        <Check id="must" />
      </Step>
    </>
  )
  return { lessonLoader: () => () => Promise.resolve({ default: Body }) }
})
vi.mock('../shell/Page', () => ({
  Page: ({ title, children }: { title: string; children: ReactNode }) => (
    <main>
      <h1>{title}</h1>
      {children}
    </main>
  ),
}))

const open = (path: string) => {
  cleanup()
  const router = createMemoryRouter(
    [
      { path: '/lesson/:lessonId/:step?', Component: Lesson },
      { path: '*', element: <p>elsewhere</p> },
    ],
    { initialEntries: [path] },
  )
  render(<RouterProvider router={router} />)
  return { router, user: userEvent.setup() }
}

describe('E5-04 lesson player', () => {
  beforeEach(() => {
    useProgress.getState().reset()
  })

  acTest('E5-04.AC1', 'a deep link opens that exact step', async () => {
    open('/lesson/basics/2')
    expect(await screen.findByText('Step two text')).toBeInTheDocument()
    expect(screen.queryByText('Step one text')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: '2. Read' })).toHaveAttribute('aria-current', 'step')
    expect(screen.getByText('Step 2 of 3')).toBeInTheDocument()
    // Out-of-range steps clamp to the last one.
    open('/lesson/basics/99')
    expect(await screen.findByText('Step three text')).toBeInTheDocument()
  })

  acTest('E5-04.AC2', 'reload restores the step and the check states', async () => {
    const first = open('/lesson/basics/1')
    await screen.findByText('Step one text')
    await first.user.click(screen.getByRole('link', { name: 'Next step →' }))
    expect(await screen.findByText('Step two text')).toBeInTheDocument()
    await first.user.click(screen.getByRole('radio', { name: 'Yes' }))
    await first.user.click(screen.getByRole('button', { name: 'Check my answer' }))
    expect(useProgress.getState().progress.lessons.basics).toMatchObject({
      currentStep: 1,
      completedSteps: ['one'],
    })
    // A fresh visit without a step resumes at the saved one, with the check still answered.
    const again = open('/lesson/basics')
    expect(await screen.findByText('Step two text')).toBeInTheDocument()
    expect(again.router.state.location.pathname).toBe('/lesson/basics/2')
    expect(screen.getByRole('radio', { name: 'Yes' })).toBeChecked()
    expect(screen.getByText(/^Why:/)).toBeInTheDocument()
    expect(screen.getByText('(done)')).toBeInTheDocument()
  })

  acTest('E5-04.AC3', 'the lesson completes only once its required checks are passed', async () => {
    const { user, router } = open('/lesson/basics/3')
    await screen.findByText('Step three text')
    await user.click(screen.getByRole('button', { name: 'Finish lesson' }))
    expect(useProgress.getState().progress.lessons.basics?.completedAt).toBeUndefined()
    expect(screen.getByText('Required question?', { selector: 'li' })).toBeInTheDocument()
    // The optional check stays unanswered; only the required one matters.
    await user.click(screen.getByRole('radio', { name: 'No' }))
    await user.click(screen.getByRole('button', { name: 'Check my answer' }))
    await user.click(screen.getByRole('button', { name: 'Finish lesson' }))
    expect(useProgress.getState().progress.lessons.basics?.completedAt).toBeUndefined()
    await user.click(screen.getByRole('radio', { name: 'Yes' }))
    await user.click(screen.getByRole('button', { name: 'Check my answer' }))
    await user.click(screen.getByRole('button', { name: 'Finish lesson' }))
    expect(useProgress.getState().progress.lessons.basics?.completedAt).toBeDefined()
    expect(router.state.location.pathname).toBe('/lesson/basics/done')
    expect(await screen.findByRole('heading', { name: 'Lesson complete' })).toBeInTheDocument()
    expect(screen.getByText('Read a pod’s events')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Next: The next one' })).toHaveAttribute(
      'href',
      '/lesson/next-one',
    )
  })

  acTest(
    'E5-04.AC3',
    'completion is decided by the required checks and challenges alone',
    async () => {
      const { lessonCompletion } = await import('@/content')
      const lesson = {
        checks: MANIFEST.regions[0]?.modules[0]?.lessons[0]?.checks ?? [],
        challenges: [
          { id: 'c1', required: true },
          { id: 'c2', required: false },
        ],
      }
      expect(
        lessonCompletion(lesson, { passedChecks: new Set(), completedChallenges: new Set() })
          .missing,
      ).toEqual([
        { kind: 'check', id: 'must' },
        { kind: 'challenge', id: 'c1' },
      ])
      expect(
        lessonCompletion(lesson, {
          passedChecks: new Set(['must']),
          completedChallenges: new Set(['c1']),
        }).complete,
      ).toBe(true)
      // An unfinished /done link goes back to the lesson.
      open('/lesson/basics/done')
      expect(await screen.findByText(/Step \d of 3/)).toBeInTheDocument()
      open('/lesson/nope/1')
      expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument()
    },
  )
})
