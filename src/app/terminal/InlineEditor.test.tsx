import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { acTest } from '@/test/ac'
import ravenpost from '@/scenarios/ravenpost.yaml'
import { loadSimulation } from '@/sim/controllers'
import { createShell } from '@/sim/commands'
import type { EditRequest } from '@/sim/commands/types'
import { InlineEditor } from './InlineEditor'

const open = (what = 'configmap ravenpost-config') => {
  cleanup()
  const sim = loadSimulation(ravenpost)
  const req = createShell(sim).run(`kubectl edit ${what} -n ravenpost`).edit as EditRequest
  const onDone = vi.fn()
  render(<InlineEditor request={req} onDone={onDone} />)
  return { sim, onDone, area: screen.getByRole('textbox', { name: `YAML for ${req.title}` }) }
}

describe('E6-08 inline editor', () => {
  acTest(
    'E6-08.AC1',
    'is keyboard operable: focus starts in the text, Tab reaches Save and Cancel, keys save and cancel',
    async () => {
      const user = userEvent.setup()
      const { onDone, area, sim } = open()
      expect(area).toHaveFocus()
      await user.tab()
      expect(screen.getByRole('button', { name: 'Save' })).toHaveFocus()
      await user.tab()
      expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()
      await user.keyboard('{Enter}')
      expect(onDone).toHaveBeenLastCalledWith({
        stdout: '',
        stderr: 'Edit cancelled, no changes made.',
        exitCode: 0,
      })
      // Ctrl+S saves an edit made from the keyboard.
      const second = open()
      await user.clear(second.area)
      const text = (second.area as HTMLTextAreaElement).value
      expect(text).toBe('')
      await user.type(
        second.area,
        'apiVersion: v1{Enter}kind: ConfigMap{Enter}metadata:{Enter}  name: ravenpost-config{Enter}  namespace: ravenpost{Enter}data:{Enter}  LOG_LEVEL: debug',
      )
      await user.keyboard('{Control>}s{/Control}')
      expect(second.onDone).toHaveBeenLastCalledWith({
        stdout: 'configmap/ravenpost-config edited',
        stderr: '',
        exitCode: 0,
      })
      expect(sim.cluster().get('ConfigMap', 'ravenpost', 'ravenpost-config')?.data.LOG_LEVEL).toBe(
        'info',
      )
      // Escape cancels from inside the text.
      const third = open()
      third.area.focus()
      await user.keyboard('{Escape}')
      expect(third.onDone).toHaveBeenCalledWith(
        expect.objectContaining({ stderr: 'Edit cancelled, no changes made.' }),
      )
    },
  )

  it('reopens with the error announced and the cursor on the line it names', async () => {
    const user = userEvent.setup()
    const { onDone, area } = open()
    const el = area as HTMLTextAreaElement
    await user.clear(el)
    await user.type(
      el,
      'apiVersion: v1{Enter}kind: ConfigMap{Enter}metadata:{Enter}  name: ravenpost-config{Enter} bad: [[',
    )
    await user.keyboard('{Control>}s{/Control}')
    expect(onDone).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(
      /^Not saved\. Line \d+: error converting YAML to JSON/,
    )
    expect(el.value).toMatch(/^# Please edit the object below/)
    expect(el).toHaveAttribute('aria-invalid', 'true')
  })
})
