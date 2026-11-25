import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, vi } from 'vitest'
import { acTest } from '@/test/ac'
import { Term } from './Term'

vi.mock('../../content', () => ({
  useManifest: () => ({
    regions: [],
    glossary: [
      {
        id: 'pod',
        term: 'Pod',
        aliases: [],
        related: [],
        eli5: 'A box the cluster runs your program in.',
        operator: 'o',
      },
    ],
  }),
}))

describe('E2-05 term previews', () => {
  acTest(
    'E2-05.AC3',
    'the preview opens on keyboard focus (not only hover) and closes with Esc',
    async () => {
      const user = userEvent.setup()
      render(
        <MemoryRouter>
          <p>
            A <Term id="pod">pod</Term> runs your containers.
          </p>
        </MemoryRouter>,
      )
      expect(screen.queryByRole('tooltip')).toBeNull()
      await user.tab()
      const link = screen.getByRole('link', { name: 'pod' })
      expect(link).toHaveFocus()
      expect(link).toHaveAttribute('href', '/guide/pod')
      expect(await screen.findByRole('tooltip')).toHaveTextContent(
        'Pod: A box the cluster runs your program in.',
      )
      await user.keyboard('{Escape}')
      await waitFor(() => {
        expect(screen.queryByRole('tooltip')).toBeNull()
      })
      expect(link).toHaveFocus()
      act(() => {
        link.blur()
      })
    },
  )

  acTest('E2-05.AC3', 'an unknown term is a plain link, with no preview', () => {
    render(
      <MemoryRouter>
        <Term id="nope">something</Term>
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: 'something' })).toHaveAttribute('href', '/guide/nope')
  })
})
