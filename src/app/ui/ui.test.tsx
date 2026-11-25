import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRef } from 'react'
import { describe, expect, vi } from 'vitest'
import { acTest } from '@/test/ac'
import {
  Badge,
  Button,
  Callout,
  Card,
  Checkbox,
  CodeBlock,
  Dialog,
  IconButton,
  Kbd,
  Progress,
  RadioGroup,
  SkipLink,
  StatusPill,
  Tabs,
  ToastProvider,
  Tooltip,
  VisuallyHidden,
  useToast,
} from './index'

const user = () => userEvent.setup()

describe('E1-03 component primitives', () => {
  acTest(
    'E1-03.AC1',
    'Button: a real button, activated by Enter and Space, never submitting by accident',
    async () => {
      const onClick = vi.fn()
      render(
        <form
          onSubmit={(e) => {
            e.preventDefault()
            onClick('submit')
          }}
        >
          <Button
            variant="primary"
            onClick={() => {
              onClick('click')
            }}
          >
            Go
          </Button>
          <Button disabled>Off</Button>
        </form>,
      )
      const go = screen.getByRole('button', { name: 'Go' })
      expect(go).toHaveAttribute('type', 'button')
      go.focus()
      await user().keyboard('{Enter}')
      await user().keyboard(' ')
      expect(onClick.mock.calls).toEqual([['click'], ['click']])
      expect(screen.getByRole('button', { name: 'Off' })).toBeDisabled()
    },
  )

  acTest(
    'E1-03.AC1',
    'IconButton: named by its required label, icon hidden, tooltip on focus',
    async () => {
      const u = user()
      render(<IconButton label="Copy the command" icon="⧉" />)
      const b = screen.getByRole('button', { name: 'Copy the command' })
      expect(b.querySelector('[aria-hidden="true"]')).toHaveTextContent('⧉')
      await u.tab()
      expect(b).toHaveFocus()
      expect(await screen.findByRole('tooltip')).toHaveTextContent('Copy the command')
    },
  )

  acTest('E1-03.AC1', 'Tooltip: opens on keyboard focus and closes on Escape', async () => {
    const u = user()
    render(
      <Tooltip content="Explains the control">
        <button type="button">Target</button>
      </Tooltip>,
    )
    await u.tab()
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Explains the control')
    expect(screen.getByRole('button', { name: 'Target' })).toHaveAccessibleDescription(
      'Explains the control',
    )
    await u.keyboard('{Escape}')
    await waitFor(() => {
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    })
  })

  acTest('E1-03.AC1', 'Card: a labelled region when it has a title', () => {
    render(
      <>
        <Card id="c1" title="Status" level={3}>
          body
        </Card>
        <Card as="div">plain</Card>
      </>,
    )
    expect(screen.getByRole('region', { name: 'Status' })).toHaveTextContent('body')
    expect(screen.getByRole('heading', { level: 3, name: 'Status' })).toBeInTheDocument()
  })

  acTest(
    'E1-03.AC1',
    'Dialog: named and described, focus moves in, Escape and Close return focus',
    async () => {
      const u = user()
      render(
        <Dialog
          title="Leave the scenario?"
          description="Your place is saved."
          trigger={<Button>Open</Button>}
        >
          <button type="button">Inside</button>
        </Dialog>,
      )
      const opener = screen.getByRole('button', { name: 'Open' })
      await u.click(opener)
      const dialog = await screen.findByRole('dialog', { name: 'Leave the scenario?' })
      expect(dialog).toHaveAccessibleDescription('Your place is saved.')
      expect(dialog).toContainElement(document.activeElement as HTMLElement)
      // The focus trap and inert page come from the native modal; e2e checks them in a browser.
      await u.keyboard('{Escape}')
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      })
      expect(opener).toHaveFocus()
      await u.click(opener)
      await u.click(await screen.findByRole('button', { name: 'Close' }))
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      })
      expect(opener).toHaveFocus()
    },
  )

  acTest('E1-03.AC1', 'Tabs: tablist with arrow keys, Home and End', async () => {
    const u = user()
    const onChange = vi.fn()
    render(
      <Tabs
        label="Depth"
        onValueChange={onChange}
        items={[
          { id: 'a', label: 'ELI5', content: 'A content' },
          { id: 'b', label: 'Operator', content: 'B content' },
          { id: 'c', label: 'Deep dive', content: 'C content' },
        ]}
      />,
    )
    expect(screen.getByRole('tablist', { name: 'Depth' })).toBeInTheDocument()
    const [a, b, c] = screen.getAllByRole('tab')
    expect(a).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel')).toHaveTextContent('A content')
    await u.tab()
    expect(a).toHaveFocus()
    await u.keyboard('{ArrowRight}')
    expect(b).toHaveFocus()
    expect(b).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel')).toHaveTextContent('B content')
    await u.keyboard('{End}')
    expect(c).toHaveFocus()
    await u.keyboard('{Home}')
    expect(a).toHaveFocus()
    await u.keyboard('{ArrowLeft}')
    expect(c).toHaveFocus()
    expect(onChange).toHaveBeenCalledWith('c')
  })

  acTest(
    'E1-03.AC1',
    'RadioGroup: labelled radiogroup, arrow keys select, hints describe options',
    async () => {
      const u = user()
      const onChange = vi.fn()
      render(
        <RadioGroup
          legend="What do you look at first?"
          defaultValue="logs"
          onValueChange={onChange}
          options={[
            { value: 'logs', label: 'Its logs', hint: 'kubectl logs --previous' },
            { value: 'node', label: 'The node' },
            { value: 'unsure', label: 'I’m not sure yet' },
          ]}
        />,
      )
      const group = screen.getByRole('radiogroup', { name: 'What do you look at first?' })
      const logs = within(group).getByRole('radio', { name: /Its logs/ })
      expect(logs).toBeChecked()
      expect(logs).toHaveAccessibleDescription('kubectl logs --previous')
      await u.tab()
      expect(logs).toHaveFocus()
      // Arrow keys move to the next option and select it.
      await u.keyboard('{ArrowDown}')
      const node = within(group).getByRole('radio', { name: 'The node' })
      await waitFor(() => {
        expect(node).toHaveFocus()
      })
      expect(node).toBeChecked()
      expect(onChange).toHaveBeenLastCalledWith('node')
      await u.click(screen.getByText('I’m not sure yet'))
      expect(onChange).toHaveBeenLastCalledWith('unsure')
    },
  )

  acTest('E1-03.AC1', 'Checkbox: labelled, Space toggles, disabled stays put', async () => {
    const u = user()
    const onChange = vi.fn()
    render(
      <>
        <Checkbox label="Remind me" onCheckedChange={onChange} />
        <Checkbox label="Unavailable" disabled />
      </>,
    )
    const box = screen.getByRole('checkbox', { name: 'Remind me' })
    expect(box).not.toBeChecked()
    await u.tab()
    await u.keyboard(' ')
    expect(box).toBeChecked()
    expect(onChange).toHaveBeenCalledWith(true)
    await u.click(screen.getByText('Remind me'))
    expect(box).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Unavailable' })).toBeDisabled()
  })

  acTest('E1-03.AC1', 'Progress: a named progressbar with its value in words', () => {
    render(<Progress label="Lessons in Helm Keep" value={2} max={5} />)
    const bar = screen.getByRole('progressbar', { name: 'Lessons in Helm Keep' })
    expect(bar).toHaveAttribute('aria-valuenow', '2')
    expect(bar).toHaveAttribute('aria-valuemax', '5')
    expect(bar).toHaveAttribute('aria-valuetext', '2 of 5')
    expect(screen.getByText('2 of 5')).toBeVisible()
  })

  acTest(
    'E1-03.AC1',
    'Callout: a named complementary aside whose kind is in words, not colour',
    () => {
      render(
        <>
          <Callout kind="warn">Look before you touch.</Callout>
          <Callout kind="eli5" title="Think of it as">
            A box.
          </Callout>
        </>,
      )
      expect(screen.getByRole('complementary', { name: 'Heads up' })).toHaveTextContent('Heads up')
      expect(screen.getByRole('complementary', { name: 'Think of it as' })).toHaveTextContent(
        'A box.',
      )
    },
  )

  acTest(
    'E1-03.AC1',
    'StatusPill and Badge: icon plus words, icon hidden from screen readers',
    () => {
      render(
        <>
          <StatusPill status="alert">Alert firing</StatusPill>
          <Badge>Navigator</Badge>
          <Kbd>Ctrl</Kbd>
          <VisuallyHidden>only for screen readers</VisuallyHidden>
        </>,
      )
      const pill = screen.getByText('Alert firing')
      expect(pill.querySelector('[aria-hidden="true"]')).toHaveTextContent('●')
      expect(screen.getByText('Navigator')).toBeInTheDocument()
      expect(screen.getByText('Ctrl').tagName).toBe('KBD')
      expect(screen.getByText('only for screen readers')).toHaveClass('sr-only')
    },
  )

  acTest(
    'E1-03.AC1',
    'CodeBlock: labelled, keyboard-scrollable, copy result announced',
    async () => {
      const u = user()
      const write = vi.fn(() => Promise.resolve())
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: write },
        configurable: true,
      })
      render(<CodeBlock language="shell" caption="List the pods" code="kubectl get pods" />)
      expect(screen.getByRole('figure')).toHaveTextContent('List the pods · shell')
      const region = screen.getByRole('region', { name: 'shell code' })
      expect(region).toHaveAttribute('tabindex', '0')
      await u.click(screen.getByRole('button', { name: 'Copy' }))
      expect(write).toHaveBeenCalledWith('kubectl get pods')
      expect(screen.getByRole('status')).toHaveTextContent('Copied to the clipboard.')
      write.mockImplementationOnce(() => Promise.reject(new Error('denied')))
      await u.click(screen.getByRole('button', { name: 'Copy' }))
      await waitFor(() => {
        expect(screen.getByRole('status')).toHaveTextContent(/Selected\. Press Ctrl\+C/)
      })
    },
  )

  acTest('E1-03.AC1', 'SkipLink: first in tab order, moves focus to the target', async () => {
    const u = user()
    function Harness() {
      const main = useRef<HTMLElement>(null)
      return (
        <>
          <SkipLink target={main} />
          <button type="button">Header button</button>
          <main ref={main} tabIndex={-1}>
            Main
          </main>
        </>
      )
    }
    render(<Harness />)
    await u.tab()
    const link = screen.getByRole('link', { name: 'Skip to main content' })
    expect(link).toHaveFocus()
    await u.keyboard('{Enter}')
    expect(screen.getByRole('main')).toHaveFocus()
  })

  acTest(
    'E1-03.AC1',
    'Toast: a polite notification region, dismissible with the keyboard',
    async () => {
      const u = user()
      function Trigger() {
        const toast = useToast()
        return (
          <button
            type="button"
            onClick={() => {
              toast('Progress saved', 'Saved in this browser.')
            }}
          >
            Save
          </button>
        )
      }
      render(
        <ToastProvider>
          <Trigger />
        </ToastProvider>,
      )
      expect(screen.getByRole('region', { name: /Notification/ })).toBeInTheDocument()
      await u.click(screen.getByRole('button', { name: 'Save' }))
      expect((await screen.findAllByText('Progress saved')).length).toBeGreaterThan(0)
      expect(screen.getAllByText('Saved in this browser.').length).toBeGreaterThan(0)
      // Announced politely, without moving focus.
      expect(document.querySelector('[aria-live="polite"]')).not.toBeNull()
      expect(screen.getByRole('button', { name: 'Save' })).toHaveFocus()
      await u.click(screen.getByRole('button', { name: 'Dismiss' }))
      await waitFor(() => {
        expect(screen.queryByText('Progress saved')).not.toBeInTheDocument()
      })
      act(() => undefined)
    },
  )

  acTest(
    'E1-03.AC4',
    'StatusPill never conveys status by colour alone: each status has its own icon and words',
    () => {
      const statuses = ['ok', 'warn', 'alert', 'info', 'neutral'] as const
      render(
        <>
          {statuses.map((s) => (
            <StatusPill key={s} status={s}>{`label-${s}`}</StatusPill>
          ))}
        </>,
      )
      const icons = statuses.map((s) => {
        const pill = screen.getByText(`label-${s}`)
        const icon = pill.querySelector('[aria-hidden="true"]')
        expect(icon, s).not.toBeNull()
        expect(icon?.textContent.trim(), s).not.toBe('')
        // The words are visible text, not just a colour or an icon.
        expect(pill).toHaveTextContent(`label-${s}`)
        return icon?.textContent
      })
      // Every status looks different even in greyscale.
      expect(new Set(icons).size).toBe(statuses.length)
    },
  )
})
