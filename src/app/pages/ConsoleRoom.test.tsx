import { cleanup, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, vi } from 'vitest'
import { acTest } from '@/test/ac'
import type { Manifest } from '@/content'
import { lintTsx } from '@/content/lint/rules'
import { useProgress } from '../progress'
import ConsoleRoom from './ConsoleRoom'

const MANIFEST: Manifest = {
  glossary: [],
  regions: [
    {
      id: 'console-room',
      title: 'The Console Room',
      summary: 'Where you came from.',
      mood: 'console',
      estimatedMinutes: 60,
      modules: [],
    },
    {
      id: 'chartroom',
      title: 'The Chartroom',
      summary: 'kubectl fluency and triage.',
      mood: 'reach',
      estimatedMinutes: 120,
      modules: [
        {
          id: 'm',
          regionId: 'chartroom',
          title: 'M',
          summary: 's',
          domain: 'kubernetes',
          estimatedMinutes: 120,
          lessons: [
            {
              id: 'first-look',
              regionId: 'chartroom',
              moduleId: 'm',
              title: 'Your first look at the cluster',
              objectives: ['o'],
              estimatedMinutes: 15,
              domain: 'kubernetes',
              level: 'wayfarer',
              prerequisites: [],
              terms: [],
              file: 'x.mdx',
              checks: [],
              challenges: [],
              steps: [],
            },
          ],
        },
      ],
    },
  ],
}
vi.mock('../content', () => ({ useManifest: () => MANIFEST }))
vi.mock('../shell/Page', () => ({
  Page: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}))
const show = () => {
  cleanup()
  render(
    <MemoryRouter>
      <ConsoleRoom />
    </MemoryRouter>,
  )
}

describe('E2-02 Console Room', () => {
  beforeEach(() => {
    useProgress.getState().reset()
  })

  acTest('E2-02.AC1', 'a new visitor sees the journey and the way into the Threshold', () => {
    show()
    expect(screen.getByRole('link', { name: 'Step up to the Threshold' })).toHaveAttribute(
      'href',
      '/threshold',
    )
    const journey = within(screen.getByRole('region', { name: 'The journey' }))
    expect(journey.getAllByRole('link').map((l) => l.textContent)).toEqual(['The Chartroom'])
    expect(
      within(screen.getByRole('region', { name: 'By the end you’ll be able to…' })).getAllByRole(
        'listitem',
      ),
    ).toHaveLength(5)
    expect(
      screen.getByText(/about 3 hours, at your own pace\. Your progress stays in this browser/),
    ).toBeInTheDocument()
  })

  acTest('E2-02.AC2', 'a returning visitor gets "Continue" to their last step, and the map', () => {
    useProgress.getState().setResumeAt('/lesson/first-look/3')
    show()
    expect(
      screen.getByRole('link', { name: 'Continue: Your first look at the cluster' }),
    ).toHaveAttribute('href', '/lesson/first-look/3')
    expect(screen.getByRole('link', { name: 'View the map' })).toHaveAttribute('href', '/map')
    expect(screen.queryByRole('link', { name: 'Step up to the Threshold' })).toBeNull()
    // Placed but no lesson yet: the map comes first.
    useProgress.getState().reset()
    useProgress.getState().completeThreshold({ kubernetes: 'wayfarer' })
    show()
    expect(screen.getByRole('link', { name: 'View the map' })).toHaveAttribute('href', '/map')
    expect(screen.getByRole('link', { name: 'Your trail' })).toBeInTheDocument()
  })

  acTest('E2-02.AC3', 'the page copy passes the content style lint', () => {
    const file = join(process.cwd(), 'src/app/pages/ConsoleRoom.tsx')
    expect(lintTsx(file, readFileSync(file, 'utf8'))).toEqual([])
  })
})
