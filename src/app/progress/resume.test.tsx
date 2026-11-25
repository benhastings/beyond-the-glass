import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { acTest } from '@/test/ac'
import type { Manifest } from '@/content'
import ravenpost from '@/scenarios/ravenpost.yaml'
import { useProgress } from '.'
import Lesson from '../pages/Lesson'
import { SaveStatus } from './SaveStatus'

const MANIFEST: Manifest = {
  glossary: [],
  regions: [
    {
      id: 'chartroom',
      title: 'The Chartroom',
      summary: 's',
      mood: 'reach',
      estimatedMinutes: 10,
      modules: [
        {
          id: 'm',
          regionId: 'chartroom',
          title: 'M',
          summary: 's',
          domain: 'kubernetes',
          estimatedMinutes: 10,
          lessons: [
            {
              id: 'look',
              regionId: 'chartroom',
              moduleId: 'm',
              title: 'Look',
              objectives: ['o'],
              estimatedMinutes: 10,
              domain: 'kubernetes',
              level: 'wayfarer',
              prerequisites: [],
              terms: [],
              file: 'look.mdx',
              checks: [],
              challenges: [],
              steps: [
                { id: 'one', title: 'One' },
                { id: 'two', title: 'Two' },
              ],
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
vi.mock('../lesson/load', async () => {
  const { Step } = await import('../lesson/components/Step')
  const { ScenarioTerminal } = await import('../terminal/ScenarioTerminal')
  const Body = () => (
    <>
      <Step id="one" title="One">
        <p>First step</p>
      </Step>
      <Step id="two" title="Two">
        <ScenarioTerminal scenario={ravenpost} label="Lesson terminal" />
      </Step>
    </>
  )
  return { lessonLoader: () => () => Promise.resolve({ default: Body }) }
})

const open = (path: string) => {
  cleanup()
  const router = createMemoryRouter([{ path: '/lesson/:lessonId/:step?', Component: Lesson }], {
    initialEntries: [path],
  })
  render(<RouterProvider router={router} />)
  return { router, user: userEvent.setup() }
}

describe('E3-04 resume', () => {
  beforeEach(() => {
    useProgress.getState().reset()
  })

  acTest(
    'E3-04.AC2',
    'closing mid-lesson and reopening resumes at the same step, with its terminal history',
    async () => {
      const first = open('/lesson/look/2')
      const input = await screen.findByRole('textbox', { name: 'Command' })
      await first.user.type(input, 'kubectl get pods -n ravenpost{Enter}')
      expect(useProgress.getState().progress.resumeAt?.path).toBe('/lesson/look/2')
      // "Close" the browser: everything unmounts; only what was saved remains. Then reopen without a step.
      cleanup()
      const again = open('/lesson/look')
      await waitFor(() => {
        expect(again.router.state.location.pathname).toBe('/lesson/look/2')
      })
      expect(
        await screen.findByRole('heading', { level: 3, name: /\$ kubectl get pods -n ravenpost$/ }),
      ).toBeInTheDocument()
      const input2 = screen.getByRole('textbox', { name: 'Command' })
      input2.focus()
      await again.user.keyboard('{ArrowUp}')
      expect(input2).toHaveValue('kubectl get pods -n ravenpost')
    },
  )

  it('the saved indicator shows each save, announcing at most once a minute; another tab’s change is reported', () => {
    cleanup()
    useProgress.setState({ savedAt: undefined, changedElsewhere: false })
    render(<SaveStatus />)
    expect(screen.queryByTestId('saved-indicator')).toBeNull()
    act(() => {
      useProgress.setState({ savedAt: '2026-11-25T10:00:00.000Z' })
    })
    expect(screen.getByTestId('saved-indicator')).toHaveTextContent(/^Saved /)
    const live = screen.getAllByRole('status')[0]
    const first = live?.textContent
    expect(first).toMatch(/^Progress saved at /)
    act(() => {
      useProgress.setState({ savedAt: '2026-11-25T10:00:30.000Z' })
    })
    expect(live?.textContent).toBe(first)
    act(() => {
      useProgress.setState({ savedAt: '2026-11-25T10:01:05.000Z' })
    })
    expect(live?.textContent).not.toBe(first)
    act(() => {
      useProgress.setState({ changedElsewhere: true })
    })
    expect(screen.getByText(/updated in another tab/)).toBeInTheDocument()
    act(() => {
      screen.getByRole('button', { name: 'OK' }).click()
    })
    expect(screen.queryByText(/updated in another tab/)).toBeNull()
  })
})
