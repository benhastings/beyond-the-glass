import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, vi } from 'vitest'
import { acTest } from '@/test/ac'
import type { LessonEntry, Manifest, ModuleEntry } from '@/content'
import { useProgress } from '../progress'
import JourneyMap from '../pages/Map'

const lesson = (
  id: string,
  domain: LessonEntry['domain'],
  level: LessonEntry['level'] = 'wayfarer',
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
  steps: [{ id: 's1' }],
  file: `${id}.mdx`,
  checks: [],
  challenges: [],
})
const mod = (
  regionId: string,
  id: string,
  domain: LessonEntry['domain'],
  levels: LessonEntry['level'][],
): ModuleEntry => ({
  id,
  regionId,
  title: `Module ${id}`,
  summary: 's',
  domain,
  estimatedMinutes: 10,
  lessons: levels.map((l, i) => lesson(`${id}-${String(i)}`, domain, l)),
})
const region = (id: string, title: string, modules: ModuleEntry[]) => ({
  id,
  title,
  summary: `${title} summary`,
  mood: 'reach' as const,
  estimatedMinutes: 10,
  modules,
})
const MANIFEST: Manifest = {
  glossary: [],
  regions: [
    region('console-room', 'The Console Room', [
      mod('console-room', 'ops', 'foundations', ['wayfarer']),
    ]),
    region('harbor', 'The Harbor', [
      mod('harbor', 'images', 'containers', ['wayfarer']),
      mod('harbor', 'builds', 'containers', ['deckhand']),
    ]),
    region('chartroom', 'The Chartroom', [
      mod('chartroom', 'pods', 'kubernetes', ['wayfarer', 'wayfarer']),
    ]),
    region('stormwatch', 'Stormwatch', []),
  ],
}
vi.mock('../content', () => ({ useManifest: () => MANIFEST }))
vi.mock('../shell/Page', () => ({
  Page: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}))

const show = (path = '/map') => {
  cleanup()
  render(
    <MemoryRouter initialEntries={[path]}>
      <JourneyMap />
    </MemoryRouter>,
  )
  return userEvent.setup()
}
const mapLinks = () =>
  within(screen.getByRole('group', { name: /Regions of the Reach/ })).getAllByRole('link')

describe('E2-03 journey map', () => {
  beforeEach(() => {
    useProgress.getState().reset()
  })

  acTest(
    'E2-03.AC1',
    'arrow keys move between regions (roving tabindex), Enter opens one; names carry status',
    async () => {
      useProgress.getState().completeLesson('pods-0')
      const user = show()
      const links = mapLinks()
      expect(links.map((l) => l.getAttribute('aria-label'))).toEqual([
        'The Console Room, recommended next, 0 of 1 modules',
        'The Harbor, not started, 0 of 2 modules',
        'The Chartroom, in progress, 0 of 1 modules',
        'Stormwatch, not started',
      ])
      expect(links.filter((l) => l.tabIndex === 0)).toHaveLength(1)
      await user.tab()
      await user.tab()
      await user.tab()
      await user.tab()
      expect(links[0]).toHaveFocus()
      await user.keyboard('{ArrowRight}')
      expect(links[1]).toHaveFocus()
      expect(links[1]?.tabIndex).toBe(0)
      await user.keyboard('{End}')
      expect(links[3]).toHaveFocus()
      await user.keyboard('{ArrowRight}')
      expect(links[0]).toHaveFocus()
      await user.keyboard('{ArrowLeft}{Home}{ArrowDown}{ArrowUp}')
      expect(links[0]).toHaveFocus()
      expect(links[2]).toHaveAttribute('href', '/region/chartroom')
    },
  )

  acTest('E2-03.AC2', 'status is shown with a symbol and words, never colour alone', () => {
    show()
    for (const l of mapLinks())
      expect(l.textContent).toMatch(
        /(★|◐|✓|○|·)(recommended next|in progress|complete|optional \(tested out\)|not started)/,
      )
  })

  acTest(
    'E2-03.AC3',
    'the map and list views show the same regions, statuses and counts',
    async () => {
      useProgress.getState().completeLesson('images-0')
      let user = show()
      const fromMap = mapLinks().map((l) => l.getAttribute('aria-label'))
      await user.click(screen.getByRole('button', { name: 'List view' }))
      const fromList = within(screen.getByRole('list'))
        .getAllByRole('link')
        .map((l) => l.getAttribute('aria-label'))
      expect(fromList).toEqual(fromMap)
      expect(screen.getByRole('button', { name: 'List view' })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
      // The hidden link at the top switches to the list too.
      user = show()
      await user.tab()
      expect(screen.getByRole('link', { name: 'Show the regions as a list' })).toHaveFocus()
      await user.keyboard('{Enter}')
      expect(screen.getByRole('list')).toBeInTheDocument()
    },
  )

  acTest('E2-03.AC4', 'the map reflects the placement as soon as the quiz is done', () => {
    show()
    expect(mapLinks()[0]?.getAttribute('aria-label')).toMatch(/recommended next/)
    // A learner who knows Linux and containers well: the Console Room is optional, and so is the Harbor's
    // first module; the next suggestion is the Chartroom, which the placement recommends (the Harbor’s builds module is only a review).
    useProgress.getState().completeThreshold({
      foundations: 'navigator',
      containers: 'navigator',
      kubernetes: 'wayfarer',
      delivery: 'wayfarer',
      observability: 'wayfarer',
    })
    show()
    expect(mapLinks().map((l) => l.getAttribute('aria-label'))).toEqual([
      'The Console Room, optional (tested out), 0 of 1 modules',
      'The Harbor, not started, 0 of 2 modules',
      'The Chartroom, recommended next, 0 of 1 modules',
      'Stormwatch, not started',
    ])
  })
})
