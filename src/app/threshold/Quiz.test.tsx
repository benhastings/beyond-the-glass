import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { beforeEach, describe, expect } from 'vitest'
import { acTest } from '@/test/ac'
import { useProgress } from '../progress'
import { Quiz } from './Quiz'

const open = (path = '/threshold') => {
  cleanup()
  const router = createMemoryRouter(
    [
      { path: '/threshold', element: <Quiz /> },
      { path: '/threshold/results', element: <p>results page</p> },
    ],
    { initialEntries: [path] },
  )
  render(<RouterProvider router={router} />)
  return { router, user: userEvent.setup() }
}

describe('E4-02 quiz', () => {
  beforeEach(() => {
    useProgress.getState().reset()
  })

  acTest(
    'E4-02.AC1',
    'is keyboard operable: options are a radio group and arrow keys move within it',
    async () => {
      const { user, router } = open()
      expect(screen.getByText(/There are no wrong answers/)).toBeInTheDocument()
      await user.tab()
      expect(screen.getByRole('button', { name: 'Begin' })).toHaveFocus()
      await user.keyboard('{Enter}')
      await waitFor(() => {
        expect(screen.getByText('Question 1 of 10')).toHaveFocus()
      })
      const group = screen.getByRole('radiogroup', { name: /Linux command line/ })
      expect(group).toBeInTheDocument()
      await user.tab()
      // Radix's roving focus hands focus to the first option once the group receives it.
      await waitFor(() => {
        expect(screen.getAllByRole('radio')[0]).toHaveFocus()
      })
      await user.keyboard('{ArrowDown}{ArrowDown}')
      expect(screen.getByRole('radio', { name: 'Most weeks, for routine checks' })).toBeChecked()
      await user.tab()
      await user.tab()
      expect(screen.getByRole('button', { name: 'Next →' })).toHaveFocus()
      await user.keyboard('{Enter}')
      expect(router.state.location.search).toBe('?q=2')
      // Answering "sometimes" unlocked two foundations scenarios; the count grew accordingly.
      expect(screen.getByText('Question 2 of 11')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Next →' })).toBeDisabled()
    },
  )

  acTest(
    'E4-02.AC3',
    'reloading mid-quiz resumes at the same question with prior answers intact',
    async () => {
      const first = open()
      await first.user.click(screen.getByRole('button', { name: 'Begin' }))
      await first.user.click(screen.getByRole('radio', { name: 'Most weeks, for routine checks' }))
      await first.user.click(screen.getByRole('button', { name: 'Next →' }))
      await first.user.click(
        screen.getByRole('radio', { name: 'Whether a process is listening on port 8080' }),
      )
      await first.user.click(screen.getByRole('button', { name: 'Next →' }))
      const at = first.router.state.location.search
      expect(at).toBe('?q=3')
      // "Reload": a fresh router at the same URL; the store keeps what was saved.
      open(`/threshold${at}`)
      expect(screen.getByText(/^Question 3 of/)).toBeInTheDocument()
      await userEvent.setup().click(screen.getByRole('button', { name: '← Back' }))
      expect(
        screen.getByRole('radio', { name: 'Whether a process is listening on port 8080' }),
      ).toBeChecked()
      // Coming back later without the URL: the intro offers to carry on.
      open('/threshold')
      expect(
        screen.getByRole('button', { name: 'Carry on where you left off' }),
      ).toBeInTheDocument()
    },
  )

  acTest(
    'E4-02.AC4',
    'no timer, no countdown, no score: through the whole quiz to results',
    async () => {
      const { user, router } = open()
      await user.click(screen.getByRole('button', { name: 'Begin' }))
      for (let n = 0; n < 20 && !router.state.location.search.includes('review'); n++) {
        expect(document.body.textContent).not.toMatch(
          /\bscore|\d+\s*%|seconds? left|minutes? left|time left|timer/i,
        )
        const radios = screen.getAllByRole('radio')
        await user.click(radios[0] as HTMLElement)
        await user.click(screen.getByRole('button', { name: 'Next →' }))
      }
      expect(screen.getByRole('heading', { name: 'Reviewing your answers' })).toBeInTheDocument()
      expect(document.body.textContent).not.toMatch(/\bscore|correct|wrong|\d+\s*%/i)
      await user.click(
        screen.getAllByRole('button', { name: /^Change your answer to/ })[0] as HTMLElement,
      )
      expect(router.state.location.search).toBe('?q=1')
      await user.click(screen.getByRole('button', { name: 'Next →' }))
      router.navigate('/threshold?q=review').catch(() => undefined)
      await screen.findByRole('button', { name: 'See your trail' })
      await user.click(screen.getByRole('button', { name: 'See your trail' }))
      expect(await screen.findByText('results page')).toBeInTheDocument()
      expect(useProgress.getState().progress.threshold.placement).toEqual({
        foundations: 'wayfarer',
        containers: 'wayfarer',
        kubernetes: 'wayfarer',
        delivery: 'wayfarer',
        observability: 'wayfarer',
      })
    },
  )

  acTest('E4-02.AC4', 'skipping the Threshold sets every domain to Wayfarer', async () => {
    const { user } = open()
    await user.click(
      screen.getByRole('button', { name: 'Skip the Threshold and start from the very beginning' }),
    )
    expect(await screen.findByText('results page')).toBeInTheDocument()
    expect(Object.values(useProgress.getState().progress.threshold.placement ?? {})).toEqual(
      Array(5).fill('wayfarer'),
    )
    expect(useProgress.getState().progress.threshold.completedAt).toBeDefined()
  })
})
