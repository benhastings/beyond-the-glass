import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { beforeEach, describe, expect, vi } from 'vitest'
import { acTest } from '@/test/ac'
import type { LessonEntry, Manifest, ModuleEntry } from '@/content'
import { useProgress } from '../progress'
import JourneyMap from '../pages/Map'
import { Results } from './Results'

const lesson = (
  id: string,
  domain: LessonEntry['domain'],
  level: LessonEntry['level'],
): LessonEntry => ({
  id,
  regionId: 'r',
  moduleId: 'm',
  title: id,
  objectives: ['o'],
  estimatedMinutes: 5,
  domain,
  level,
  prerequisites: [],
  terms: [],
  steps: [],
  file: `${id}.mdx`,
  checks: [],
  challenges: [],
})
const mod = (
  regionId: string,
  id: string,
  domain: LessonEntry['domain'],
  level: LessonEntry['level'],
): ModuleEntry => ({
  id,
  regionId,
  title: `Module ${id}`,
  summary: 's',
  domain,
  estimatedMinutes: 5,
  lessons: [lesson(`${id}-1`, domain, level)],
})
const MANIFEST: Manifest = {
  glossary: [],
  regions: [
    {
      id: 'console-room',
      title: 'The Console Room',
      summary: 's',
      mood: 'console',
      estimatedMinutes: 5,
      modules: [mod('console-room', 'ops', 'foundations', 'wayfarer')],
    },
    {
      id: 'harbor',
      title: 'The Harbor',
      summary: 's',
      mood: 'reach',
      estimatedMinutes: 5,
      modules: [mod('harbor', 'images', 'containers', 'wayfarer')],
    },
    {
      id: 'chartroom',
      title: 'The Chartroom',
      summary: 's',
      mood: 'reach',
      estimatedMinutes: 5,
      modules: [mod('chartroom', 'pods', 'kubernetes', 'wayfarer')],
    },
  ],
}
vi.mock('../content', () => ({ useManifest: () => MANIFEST }))
vi.mock('../shell/Page', () => ({
  Page: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}))

const show = (path = '/threshold/results') => {
  cleanup()
  const router = createMemoryRouter(
    [
      { path: '/threshold/results', element: <Results /> },
      { path: '/map', Component: JourneyMap },
    ],
    { initialEntries: [path] },
  )
  render(<RouterProvider router={router} />)
  return { router, user: userEvent.setup() }
}
const recommendedOnMap = () => {
  show('/map')
  return screen
    .getAllByRole('link')
    .map((l) => l.getAttribute('aria-label') ?? '')
    .filter((n) => n.includes('recommended next'))
}

describe('E4-04 results', () => {
  beforeEach(() => {
    useProgress.getState().reset()
    // Took the quiz: knows Linux well, new to the rest.
    const s = useProgress.getState()
    s.recordThresholdAnswer('foundations-shell', 'weekly')
    s.recordThresholdAnswer('foundations-dns', 'dns')
    s.recordThresholdAnswer('foundations-exit', 'not-sure')
    s.completeThreshold({
      foundations: 'navigator',
      containers: 'wayfarer',
      kubernetes: 'wayfarer',
      delivery: 'wayfarer',
      observability: 'wayfarer',
    })
  })

  acTest(
    'E4-04.AC1',
    'the tracks have an equivalent text list: each domain with its level name and meaning',
    async () => {
      const { user } = show()
      expect(screen.getByText('Your trail begins at the Harbor.')).toBeInTheDocument()
      const list = within(screen.getByRole('list', { name: 'Your level in each area' }))
      const items = list
        .getAllByRole('listitem')
        .filter((li) => li.parentElement?.getAttribute('aria-label'))
      expect(items.map((li) => li.querySelector('p')?.textContent)).toEqual([
        'Linux, networking and operations: Navigator. You use it. We skip the introductions.',
        'Containers: Wayfarer. New to this. We start from the beginning.',
        'Kubernetes: Wayfarer. New to this. We start from the beginning.',
        'Git, CI/CD and GitOps: Wayfarer. New to this. We start from the beginning.',
        'Observability: Wayfarer. New to this. We start from the beginning.',
      ])
      // The visual tracks are hidden from assistive tech, because the list says the same.
      expect(document.querySelector('[aria-hidden="true"] .grid-cols-4')).not.toBeNull()
      await user.click(screen.getAllByText('Why we suggested this')[0] as HTMLElement)
      expect(
        screen.getByText('You said: “Daily or weekly, as part of my job”.'),
      ).toBeInTheDocument()
      expect(screen.getByText(/^You knew: “One server can reach/)).toBeInTheDocument()
      expect(
        screen.getByText(/^You weren’t sure yet about: “A process exits with code 137/),
      ).toBeInTheDocument()
      expect(screen.getByText('Module images')).toBeInTheDocument()
    },
  )

  acTest(
    'E4-04.AC2',
    'overrides and a chosen starting point persist and show on the map',
    async () => {
      expect(recommendedOnMap()).toEqual(['The Harbor, recommended next, 0 of 1 modules'])
      let { user } = show()
      const containers = screen.getAllByRole('combobox', {
        name: 'Change my level',
      })[1] as HTMLElement
      await user.selectOptions(containers, 'pathfinder')
      expect(useProgress.getState().progress.threshold.overrides).toEqual({
        containers: 'pathfinder',
      })
      expect(screen.getByText('You chose this level yourself.')).toBeInTheDocument()
      expect(recommendedOnMap()).toEqual(['The Chartroom, recommended next, 0 of 1 modules'])
      ;({ user } = show())
      await user.selectOptions(
        screen.getByRole('combobox', { name: 'Start in' }),
        'The Console Room',
      )
      expect(useProgress.getState().progress.threshold.startRegion).toBe('console-room')
      expect(recommendedOnMap()).toEqual(['The Console Room, recommended next, 0 of 1 modules'])
      ;({ user } = show())
      await user.click(screen.getByRole('button', { name: 'Start from the very beginning' }))
      expect(useProgress.getState().progress.threshold).toMatchObject({
        overrides: {},
        placement: { foundations: 'wayfarer' },
      })
      expect(useProgress.getState().progress.threshold.startRegion).toBeUndefined()
      expect(recommendedOnMap()).toEqual(['The Console Room, recommended next, 0 of 1 modules'])
    },
  )

  acTest('E4-04.AC2', 'Step through the glass goes on to the map', async () => {
    const { user, router } = show()
    await user.click(screen.getByRole('button', { name: 'Step through the glass' }))
    expect(router.state.location.pathname).toBe('/map')
  })
})
