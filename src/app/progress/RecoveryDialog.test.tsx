import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { acTest } from '@/test/ac'
import { emptyProgress, PROGRESS_KEY, type Recovery } from '@/progress'
import { memoryStorage } from './memory-storage'
import { RecoveryDialog } from './RecoveryDialog'
import { createProgressStore } from './store'

const T = '2026-11-24T10:00:00.000Z'
const corrupt: Recovery = {
  kind: 'corrupt',
  reason: 'The saved data is not valid JSON.',
  dropped: [],
  raw: '{oops',
  backupKey: `${PROGRESS_KEY}:backup:${T}`,
}

describe('RecoveryDialog', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders nothing without an incident', () => {
    const { container } = render(<RecoveryDialog recovery={undefined} onClose={() => undefined} />)
    expect(container).toBeEmptyDOMElement()
  })

  acTest(
    'E3-02.AC2',
    'is a labelled, described dialog with a download and a way to continue',
    async () => {
      const onClose = vi.fn()
      render(<RecoveryDialog recovery={corrupt} onClose={onClose} />)
      const dialog = screen.getByRole('dialog', { name: 'Your saved progress couldn’t be read' })
      expect(dialog).toHaveAccessibleDescription(/fresh record.*download it.*not valid JSON/s)
      const create = vi.fn(() => 'blob:x')
      const revoke = vi.fn()
      vi.stubGlobal('URL', { ...URL, createObjectURL: create, revokeObjectURL: revoke })
      const click = vi
        .spyOn(HTMLAnchorElement.prototype, 'click')
        .mockImplementation(() => undefined)
      await userEvent.click(screen.getByRole('button', { name: 'Download the old data' }))
      expect(create).toHaveBeenCalledOnce()
      expect(click).toHaveBeenCalledOnce()
      expect(revoke).toHaveBeenCalledWith('blob:x')
      vi.unstubAllGlobals()
      await userEvent.click(screen.getByRole('button', { name: 'Continue' }))
      expect(onClose).toHaveBeenCalledOnce()
    },
  )

  it('words a repair differently, and copes without a backup', () => {
    render(
      <RecoveryDialog
        recovery={{
          ...corrupt,
          kind: 'repaired',
          reason: 'Some parts…',
          dropped: ['checks'],
          backupKey: undefined,
        }}
        onClose={() => undefined}
      />,
    )
    expect(
      screen.getByRole('dialog', { name: 'Some of your saved progress couldn’t be read' }),
    ).toHaveAccessibleDescription(
      /kept everything we could read.*download the old data to keep a copy/is,
    )
  })

  acTest('E3-02.AC2', 'appears exactly once per incident', () => {
    const backing = memoryStorage({ [PROGRESS_KEY]: 'garbage' })
    const first = createProgressStore({ backing, now: () => T })
    expect(first.getState().recovery?.kind).toBe('corrupt')
    // Reloading the app: the incident was handled, so no dialog.
    const second = createProgressStore({ backing, now: () => '2026-11-24T10:01:00.000Z' })
    expect(second.getState().recovery).toBeUndefined()
    // A new incident later is reported, once.
    backing.setItem(
      PROGRESS_KEY,
      JSON.stringify({ state: { progress: { ...emptyProgress(T), checks: 1 } }, version: 1 }),
    )
    const third = createProgressStore({ backing, now: () => '2026-11-24T10:02:00.000Z' })
    expect(third.getState().recovery?.kind).toBe('repaired')
    expect(createProgressStore({ backing, now: () => T }).getState().recovery).toBeUndefined()
    expect(
      [...backing.data.keys()].filter((k) => k.startsWith(`${PROGRESS_KEY}:backup:`)),
    ).toHaveLength(2)
  })
})
