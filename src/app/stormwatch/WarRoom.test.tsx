import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { acTest } from '@/test/ac'
import { LAYOUT_KEY } from './layout'
import WarRoom from './WarRoom'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
beforeEach(() => {
  localStorage.clear()
})

const panes = () => screen.getAllByRole('region').filter((r) => r.hasAttribute('data-pane'))
const narrow = () => {
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: false,
    media: q,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }))
}

describe('E10-04 war room', () => {
  acTest(
    'E10-04.AC1',
    'every pane is a landmark with a heading, reachable by shortcut; ? lists the shortcuts',
    async () => {
      render(<WarRoom backgroundClock={false} />)
      // Two panes side by side by default, each a named region with a level-2 heading.
      expect(
        panes().map(
          (p) =>
            p.getAttribute('aria-label') ??
            within(p).getByRole('heading', { level: 2 }).textContent,
        ),
      ).toEqual(['The incident (Alt+1)', 'Terminal (Alt+2)'])
      for (const p of panes())
        expect(within(p).getAllByRole('heading', { level: 2 })).toHaveLength(1)
      expect(screen.getByRole('region', { name: /^The incident/ })).toHaveTextContent('The pager')
      // Alt+2 moves focus to the terminal pane's heading; Alt+5 brings the dashboards up and focuses them.
      await userEvent.keyboard('{Alt>}2{/Alt}')
      await act(() => new Promise((r) => requestAnimationFrame(r)))
      expect(document.activeElement).toHaveTextContent(/^Terminal/)
      await userEvent.keyboard('{Alt>}5{/Alt}')
      await act(() => new Promise((r) => requestAnimationFrame(r)))
      expect(screen.getByRole('region', { name: /^Dashboards/ })).toBeInTheDocument()
      expect(document.activeElement).toHaveTextContent(/^Dashboards/)
      // Alt+M maximizes the pane focus is in, and restores.
      await userEvent.keyboard('{Alt>}m{/Alt}')
      expect(panes()).toHaveLength(1)
      await userEvent.keyboard('{Alt>}m{/Alt}')
      expect(panes()).toHaveLength(2)
      // ? opens the list of shortcuts (not while typing).
      await userEvent.keyboard('?')
      const dialog = screen.getByRole('dialog', { name: 'Keyboard shortcuts' })
      expect(within(dialog).getAllByRole('listitem')).toHaveLength(9)
      expect(dialog).toHaveTextContent('Alt+7: Incident notes')
    },
    30_000,
  )

  acTest(
    'E10-04.AC2',
    'below 1024 px the panes are tabs, each still a landmark with a heading',
    async () => {
      narrow()
      render(<WarRoom backgroundClock={false} />)
      const tabs = within(screen.getByRole('tablist', { name: 'War room panes' })).getAllByRole(
        'tab',
      )
      expect(tabs).toHaveLength(7)
      expect(screen.queryByRole('radiogroup', { name: 'Layout' })).toBeNull()
      expect(panes()).toHaveLength(1)
      await userEvent.keyboard('{Alt>}7{/Alt}')
      expect(
        screen.getByRole('tab', { name: 'Incident notes', selected: true }),
      ).toBeInTheDocument()
      expect(screen.getByRole('region', { name: /^Incident notes/ })).toBeInTheDocument()
    },
    30_000,
  )

  acTest(
    'E10-04.AC3',
    'the layout and the notes are remembered',
    async () => {
      const { unmount } = render(<WarRoom backgroundClock={false} />)
      await userEvent.click(screen.getByRole('radio', { name: 'Three panes' }))
      await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Pane 3' }), 'argo')
      expect(panes()).toHaveLength(3)
      await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Pane 2' }), 'notes')
      await userEvent.type(
        screen.getByRole('textbox', { name: /^What you know/ }),
        'api pulls a tag CI never built',
      )
      expect(JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? '{}')).toMatchObject({
        preset: '3-up',
        slots: ['incident', 'notes', 'argo'],
      })
      unmount()
      render(<WarRoom backgroundClock={false} />)
      expect(screen.getByRole('radio', { name: 'Three panes' })).toBeChecked()
      expect(panes().map((p) => p.getAttribute('data-pane'))).toEqual(['incident', 'notes', 'argo'])
      expect(screen.getByRole('textbox', { name: /^What you know/ })).toHaveValue(
        'api pulls a tag CI never built',
      )
    },
    30_000,
  )

  it('records terminal commands, gives hints one level at a time, and resumes the incident', async () => {
    const { unmount } = render(<WarRoom backgroundClock={false} />)
    await userEvent.click(screen.getByRole('button', { name: 'Hint' }))
    expect(screen.getByRole('region', { name: /^The incident/ })).toHaveTextContent(
      'which cluster is your terminal pointed at?',
    )
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Command' }),
      'kubectl config use-context prod{Enter}',
    )
    unmount()
    render(<WarRoom backgroundClock={false} />)
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Command' }),
      'kubectl config current-context{Enter}',
    )
    const term = screen.getByRole('region', { name: /^Terminal/ })
    // The transcript came back with the incident, and the context is still prod.
    expect(term).toHaveTextContent('Switched to context "prod".')
    expect(term).toHaveTextContent('current-context. prod')
  }, 30_000)
})
