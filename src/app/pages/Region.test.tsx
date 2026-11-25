import { cleanup, render, screen, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ReactNode } from 'react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { beforeEach, describe, expect, vi } from 'vitest'
import { acTest } from '@/test/ac'
import type { LessonEntry, Manifest, ModuleEntry, RegionEntry } from '@/content'
import { useProgress } from '../progress'
import JourneyMap from './Map'
import Region from './Region'

const lesson = (id: string): LessonEntry => ({
  id,
  regionId: 'r',
  moduleId: 'm',
  title: id,
  objectives: ['o'],
  estimatedMinutes: 7,
  domain: 'kubernetes',
  level: 'wayfarer',
  prerequisites: [],
  terms: [],
  steps: [],
  file: `${id}.mdx`,
  checks: [],
  challenges: [],
})
const mod = (regionId: string, id: string, lessons: string[]): ModuleEntry => ({
  id,
  regionId,
  title: `Module ${id}`,
  summary: `About ${id}.`,
  domain: 'kubernetes',
  estimatedMinutes: 7 * lessons.length,
  lessons: lessons.map(lesson),
})
const region = (
  id: string,
  title: string,
  modules: ModuleEntry[],
  extra: Partial<RegionEntry> = {},
): RegionEntry => ({
  id,
  title,
  summary: `${title} summary.`,
  mood: 'reach',
  estimatedMinutes: 14,
  modules,
  ...extra,
})
const manifest: { current: Manifest } = { current: { glossary: [], regions: [] } }
vi.mock('../content', () => ({ useManifest: () => manifest.current }))
vi.mock('../shell/Page', () => ({
  Page: ({ title, children }: { title: string; children: ReactNode }) => (
    <main>
      <h1>{title}</h1>
      {children}
    </main>
  ),
}))

const BASE: Manifest = {
  glossary: [],
  regions: [
    region('harbor', 'The Harbor', [mod('harbor', 'images', ['images-1'])]),
    region(
      'chartroom',
      'The Chartroom',
      [mod('chartroom', 'first-look', ['first-look-1', 'first-look-2'])],
      {
        intro: 'Before you sail, you read the charts.',
        outcomes: ['Check your context', 'Find a failing pod'],
        link: { text: 'Open the chart table', to: '/somewhere' },
      },
    ),
  ],
}
const open = (path: string) => {
  cleanup()
  const router = createMemoryRouter(
    [
      { path: '/region/:regionId', Component: Region },
      { path: '/map', Component: JourneyMap },
    ],
    { initialEntries: [path] },
  )
  render(<RouterProvider router={router} />)
}

describe('E2-04 region page', () => {
  beforeEach(() => {
    useProgress.getState().reset()
    manifest.current = BASE
  })

  acTest(
    'E2-04.AC1',
    'renders entirely from the manifest: intro, outcomes, modules with status and time, neighbours',
    () => {
      useProgress.getState().completeLesson('first-look-1')
      open('/region/chartroom')
      expect(screen.getByRole('heading', { level: 1, name: 'The Chartroom' })).toBeInTheDocument()
      expect(screen.getByText('Before you sail, you read the charts.')).toBeInTheDocument()
      expect(
        within(screen.getByRole('region', { name: 'What you’ll learn' }))
          .getAllByRole('listitem')
          .map((l) => l.textContent),
      ).toEqual(['Check your context', 'Find a failing pod'])
      const modules = within(screen.getByRole('region', { name: 'Modules' }))
      expect(modules.getByRole('link', { name: 'Module first-look' })).toHaveAttribute(
        'href',
        '/lesson/first-look-1',
      )
      expect(modules.getByText(/2 lessons · about 14 minutes · 1 done/)).toBeInTheDocument()
      expect(modules.getByText('in progress')).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Open the chart table' })).toHaveAttribute(
        'href',
        '/somewhere',
      )
      const nav = within(screen.getByRole('navigation', { name: 'Regions' }))
      expect(nav.getByRole('link', { name: '← The Harbor' })).toHaveAttribute(
        'href',
        '/region/harbor',
      )
      expect(nav.queryByRole('link', { name: /→$/ })).toBeNull()
      // No region-specific code: the page never names a region.
      const src = readFileSync(join(process.cwd(), 'src/app/pages/Region.tsx'), 'utf8')
      expect(src).not.toMatch(
        /'(console-room|harbor|helm-keep|chartroom|mirror-lake|signalwood|stormwatch)'/,
      )
    },
  )

  acTest(
    'E2-04.AC2',
    'a new region in content appears on the map, the list and its own page with no code change',
    () => {
      manifest.current = {
        ...BASE,
        regions: [
          ...BASE.regions,
          region('lighthouse', 'The Lighthouse', [mod('lighthouse', 'beacons', ['beacons-1'])], {
            outcomes: ['Keep the light on'],
          }),
        ],
      }
      open('/map')
      expect(
        screen.getByRole('link', { name: /^The Lighthouse, not started, 0 of 1 modules$/ }),
      ).toBeInTheDocument()
      open('/map?view=list')
      expect(
        within(screen.getByRole('list')).getByRole('link', { name: /^The Lighthouse,/ }),
      ).toHaveAttribute('href', '/region/lighthouse')
      open('/region/lighthouse')
      expect(screen.getByRole('heading', { level: 1, name: 'The Lighthouse' })).toBeInTheDocument()
      expect(screen.getByText('Keep the light on')).toBeInTheDocument()
      expect(screen.getByRole('link', { name: '← The Chartroom' })).toBeInTheDocument()
      // A region with no modules yet says so.
      manifest.current = { ...BASE, regions: [region('empty', 'Empty', [])] }
      open('/region/empty')
      expect(screen.getByText('The lessons for this region are on their way.')).toBeInTheDocument()
      expect(screen.getByTestId('region-summary')).toHaveTextContent('Empty summary.')
    },
  )
})
