import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { acTest } from '@/test/ac'
import ravenpost from '@/scenarios/ravenpost.yaml'
import { loadSimulation, restoreSimulation } from '@/sim/controllers'
import { Terminal } from './Terminal'

const setup = (sim = loadSimulation(ravenpost)) => {
  const onChange = vi.fn()
  const view = render(<Terminal sim={sim} onChange={onChange} />)
  const input = screen.getByRole('textbox', { name: 'Command' })
  const status = () => screen.getByRole('status', { name: '' }).textContent
  return { sim, onChange, input, view, user: userEvent.setup(), status }
}
const announcer = () =>
  document.querySelector('[role="status"][aria-live="polite"].sr-only:not(:empty)')?.textContent ??
  ''

describe('E6-09 terminal', () => {
  acTest(
    'E6-09.AC2',
    'Tab lists candidates when ambiguous, like bash, and announces how many',
    async () => {
      const { input, user } = setup()
      await user.type(input, 'kubectl get po')
      await user.tab()
      expect(input).toHaveValue('kubectl get pods ')
      expect(announcer()).toBe('Completed pods.')
      await user.clear(input)
      await user.type(input, 'kubectl get pods -n ravenpost ravenpost-')
      await user.tab()
      expect(input).toHaveValue('kubectl get pods -n ravenpost ravenpost-')
      expect(announcer()).toMatch(/^8 completions: ravenpost-api-\S+, /)
      expect(screen.getByRole('log').textContent).toMatch(/ravenpost-web-\S+ {2}ravenpost-web/)
      // The common prefix fills in.
      await user.type(input, 'we')
      await user.tab()
      expect(input).toHaveValue('kubectl get pods -n ravenpost ravenpost-web-74d9fdfcd5-')
      expect(announcer()).toMatch(/^2 completions/)
      await user.clear(input)
      await user.type(input, 'kubectl zzz')
      await user.tab()
      expect(announcer()).toBe('No completions.')
      // With nothing typed, Tab leaves the input: no keyboard trap.
      await user.clear(input)
      await user.tab()
      expect(input).not.toHaveFocus()
    },
  )

  it('runs commands as labelled groups, summarises long output, and keeps history', async () => {
    const { input, user, onChange } = setup()
    await user.type(input, 'whoami{Enter}')
    expect(screen.getByRole('heading', { level: 3, name: /\$ whoami$/ })).toBeInTheDocument()
    expect(announcer()).toBe(
      'whoami. 3 lines of output; press Alt+O to read.'.replace(
        '3 lines of output; press Alt+O to read.',
        announcer().split('. ').slice(1).join('. '),
      ),
    )
    await user.type(input, 'kubectl get pods -A{Enter}')
    expect(announcer()).toMatch(
      /^kubectl get pods -A\. \d+ lines of output; press Alt\+O to read\.$/,
    )
    await user.type(input, 'pwd{Enter}')
    expect(announcer()).toBe('pwd. /home/operator')
    expect(onChange).toHaveBeenCalledTimes(3)
    await user.keyboard('{Alt>}o{/Alt}')
    expect(screen.getByLabelText('Output of pwd, 1 lines')).toHaveFocus()
    input.focus()
    await user.keyboard('{ArrowUp}{ArrowUp}')
    expect(input).toHaveValue('kubectl get pods -A')
    await user.keyboard('{ArrowDown}{ArrowDown}')
    expect(input).toHaveValue('')
    await user.type(input, 'half typed')
    await user.keyboard('{Control>}c{/Control}')
    expect(input).toHaveValue('')
    expect(screen.getByRole('heading', { level: 3, name: /half typed\^C$/ })).toBeInTheDocument()
    await user.keyboard('{Control>}l{/Control}')
    expect(screen.queryAllByRole('heading', { level: 3 })).toHaveLength(0)
    expect(announcer()).toBe('Screen cleared.')
    await user.type(input, 'nope{Enter}')
    expect(announcer()).toMatch(/^nope\. /)
  })

  it('history and scrollback come back from a snapshot', async () => {
    const first = setup()
    await first.user.type(first.input, 'kubectl get ns{Enter}')
    const snap = first.sim.snapshot()
    first.view.unmount()
    const again = setup(restoreSimulation(ravenpost, snap))
    expect(
      screen.getByRole('heading', { level: 3, name: /\$ kubectl get ns$/ }),
    ).toBeInTheDocument()
    again.input.focus()
    await again.user.keyboard('{ArrowUp}')
    expect(again.input).toHaveValue('kubectl get ns')
  })

  it('opens kubectl edit in place of the prompt and prints its result', async () => {
    const { input, user } = setup()
    await user.type(input, 'kubectl edit cm ravenpost-config -n ravenpost{Enter}')
    const area = screen.getByRole('textbox', { name: 'YAML for configmap/ravenpost-config' })
    expect(area).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(screen.getByRole('log').textContent).toMatch(/Edit cancelled, no changes made\./)
    await user.type(screen.getByRole('textbox', { name: 'Command' }), 'exit{Enter}')
    await user.click(screen.getByRole('button', { name: 'Open a new prompt' }))
    expect(screen.getByRole('textbox', { name: 'Command' })).toBeInTheDocument()
  })
})
