import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect } from 'vitest'
import { acTest } from '@/test/ac'
import { CHALLENGES } from '@/challenges'
import ravenpost from '@/scenarios/ravenpost.yaml'
import { progressV1 } from '@/progress'
import { useProgress } from '../progress'
import { ChallengeTerminal } from './ChallengeTerminal'

describe('E6-10 challenge terminal', () => {
  acTest(
    'E6-10.AC3',
    'hints used show in progress, and a challenge completes with or without them',
    async () => {
      useProgress.getState().reset()
      const challenge = CHALLENGES['find-the-failing-pod']
      if (!challenge) throw new Error('missing challenge')
      const user = userEvent.setup()
      render(<ChallengeTerminal challenge={challenge} scenario={ravenpost} />)
      const list = screen.getByRole('list', { name: /Objectives \(0 of 2 done\)/ })
      expect(within(list).getAllByText(/\(to do\)/)).toHaveLength(2)
      await user.click(screen.getByRole('button', { name: 'Show a hint' }))
      expect(screen.getByText(/^Hint 1 of 3 \(nudge\):/)).toBeInTheDocument()
      expect(useProgress.getState().progress.challenges[challenge.id]).toMatchObject({
        hintsUsed: 1,
        status: 'in-progress',
      })
      const input = screen.getByRole('textbox', { name: 'Command' })
      await user.type(input, 'hint{Enter}')
      expect(useProgress.getState().progress.challenges[challenge.id]?.hintsUsed).toBe(2)
      await user.type(input, 'kubectl get pods -n ravenpost{Enter}')
      expect(screen.getByRole('list', { name: /1 of 2 done/ })).toBeInTheDocument()
      await user.type(input, 'answer failing-pod ravenpost-api{Enter}')
      expect(screen.getByRole('log').textContent).toMatch(/Not quite/)
      await user.type(input, 'answer failing-pod ravenpost-notifier{Enter}')
      expect(screen.getByText(/^Challenge complete\./)).toBeInTheDocument()
      expect(useProgress.getState().progress.challenges[challenge.id]).toMatchObject({
        status: 'completed',
        hintsUsed: 2,
      })
      // Everything it saved reads back: progress still passes its schema (it's validated on every load).
      expect(progressV1.safeParse(useProgress.getState().progress).success).toBe(true)
    },
  )
})
