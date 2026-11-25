import { render as rtlRender, screen, waitFor } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { encodeProgress, emptyProgress } from '@/progress'
import { useProgress } from '../progress'
import { SettingsPanel } from './SettingsPanel'

const render = (ui: ReactElement) => rtlRender(<MemoryRouter>{ui}</MemoryRouter>)

describe('E2-06 import', () => {
  beforeEach(() => {
    useProgress.getState().reset()
  })

  it('imports a progress code, combining it with what is here; bad codes are explained', async () => {
    useProgress.getState().completeLesson('here')
    const other = {
      ...emptyProgress('2026-11-25T10:00:00.000Z'),
      lessons: {
        there: { currentStep: 0, completedSteps: [], completedAt: '2026-11-25T10:00:00.000Z' },
      },
    }
    const code = await encodeProgress(other, { compress: false })
    const user = userEvent.setup()
    render(<SettingsPanel />)
    await user.type(screen.getByRole('textbox', { name: 'Import progress' }), 'nonsense')
    await user.click(screen.getByRole('button', { name: 'Import' }))
    expect(await screen.findByText(/^That couldn’t be imported:/)).toBeInTheDocument()
    await user.clear(screen.getByRole('textbox', { name: 'Import progress' }))
    await user.click(screen.getByRole('textbox', { name: 'Import progress' }))
    await user.paste(code)
    await user.click(screen.getByRole('button', { name: 'Import' }))
    await waitFor(() => {
      expect(Object.keys(useProgress.getState().progress.lessons).sort()).toEqual(['here', 'there'])
    })
    expect(screen.getByText(/^Imported\./)).toBeInTheDocument()
  })
})
