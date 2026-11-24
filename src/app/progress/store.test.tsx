import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { acTest } from '@/test/ac'
import { emptyProgress, PROGRESS_KEY } from '@/progress'
import { memoryStorage } from './memory-storage'
import { StorageNotice } from './StorageNotice'
import { createProgressStore, type ProgressStore } from './store'

const T = '2026-11-24T10:00:00.000Z'
const now = () => T

function stored(data: Map<string, string>) {
  return JSON.parse(data.get(PROGRESS_KEY) ?? 'null') as {
    state: { progress: unknown }
    version: number
  } | null
}

function Notice({ store }: { store: ProgressStore }) {
  const failure = store((s) => s.storageFailure)
  const dismiss = store((s) => s.dismissStorageFailure)
  return <StorageNotice failure={failure} onDismiss={dismiss} />
}

describe('progress store', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('persists under btg:progress, debounced, as { state: { progress }, version: 1 }', () => {
    const backing = memoryStorage()
    const store = createProgressStore({ backing, now })
    store.getState().completeStep('l1', 's1')
    store.getState().goToStep('l1', 1)
    expect(backing.data.has(PROGRESS_KEY)).toBe(false)
    vi.advanceTimersByTime(500)
    const saved = stored(backing.data)
    expect(saved?.version).toBe(1)
    expect(saved?.state.progress).toMatchObject({
      lessons: { l1: { currentStep: 1, completedSteps: ['s1'] } },
    })
    // Only progress is persisted, never UI state such as a pending notice.
    expect(Object.keys(saved?.state ?? {})).toEqual(['progress'])
  })

  it('loads and validates stored progress', () => {
    const p = { ...emptyProgress(T), displayName: 'Ari' }
    const backing = memoryStorage({
      [PROGRESS_KEY]: JSON.stringify({ state: { progress: p }, version: 1 }),
    })
    const store = createProgressStore({ backing, now })
    expect(store.getState().progress.displayName).toBe('Ari')
    expect(store.getState().loadFailed).toBe(false)
  })

  it('starts fresh from invalid stored progress and leaves it in place for recovery', () => {
    const raw = JSON.stringify({
      state: { progress: { schemaVersion: 1, lessons: 'nope' } },
      version: 1,
    })
    const backing = memoryStorage({ [PROGRESS_KEY]: raw })
    const store = createProgressStore({ backing, now })
    expect(store.getState().loadFailed).toBe(true)
    expect(store.getState().progress).toEqual(emptyProgress(T))
    expect(backing.data.get(PROGRESS_KEY)).toBe(raw)
  })

  it('runs every action through to the stored record', () => {
    const backing = memoryStorage()
    const store = createProgressStore({ backing, now })
    const s = store.getState()
    s.setDisplayName('Ari')
    s.recordThresholdAnswer('q1', 'a')
    s.completeThreshold({ kubernetes: 'deckhand' })
    s.overrideLevel('kubernetes', 'navigator')
    s.chooseStartRegion('chartroom')
    s.goToStep('l1', 2)
    s.completeStep('l1', 'a')
    s.setDepth('l1', 'deep')
    s.completeLesson('l1')
    s.recordCheckAttempt('c1', 'b', true)
    s.updateChallenge('ch1', { status: 'completed', hintsUsed: 1 })
    s.saveScenario('ravenpost', { act: 2 })
    s.updateSettings({ reduceMotion: 'on' })
    store.storage.flush()
    expect(stored(backing.data)?.state.progress).toMatchObject({
      displayName: 'Ari',
      threshold: {
        answers: { q1: 'a' },
        placement: { kubernetes: 'deckhand' },
        overrides: { kubernetes: 'navigator' },
        startRegion: 'chartroom',
      },
      lessons: { l1: { currentStep: 2, completedSteps: ['a'], depth: 'deep', completedAt: T } },
      checks: { c1: { attempts: 1, passed: true } },
      challenges: { ch1: { status: 'completed', hintsUsed: 1 } },
      scenarios: { ravenpost: { act: 2 } },
      settings: { reduceMotion: 'on' },
    })
    store.getState().reset()
    expect(store.getState().progress).toEqual(emptyProgress(T))
  })

  acTest(
    'E3-01.AC3',
    'storage quota exceeded shows a notice suggesting export, without crashing',
    async () => {
      vi.useRealTimers()
      const backing = memoryStorage()
      let full = true
      const save = backing.setItem
      backing.setItem = (k, v) => {
        if (full)
          throw Object.assign(new Error('The quota has been exceeded.'), {
            name: 'QuotaExceededError',
          })
        save(k, v)
      }
      const store = createProgressStore({ backing, now, intervalMs: 10 })
      render(<Notice store={store} />)
      const region = screen.getByRole('status')
      expect(region).toBeEmptyDOMElement()
      expect(() => {
        store.getState().completeStep('l1', 's1')
      }).not.toThrow()
      act(() => {
        store.storage.flush()
      })
      expect(store.getState().storageFailure).toBe('quota')
      expect(region).toHaveTextContent(/storage is full/i)
      expect(region).toHaveTextContent(/export your progress/i)
      // The learner's progress is still there in memory.
      expect(store.getState().progress.lessons.l1?.completedSteps).toEqual(['s1'])
      await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
      expect(region).toBeEmptyDOMElement()
      // Further failed saves don't bring a dismissed notice straight back...
      act(() => {
        store.getState().completeStep('l1', 's2')
        store.storage.flush()
      })
      expect(region).toBeEmptyDOMElement()
      // ...but if saving recovers and then fails again, the learner hears about it.
      full = false
      act(() => {
        store.storage.flush()
      })
      expect(backing.data.get(PROGRESS_KEY)).toContain('"s2"')
      full = true
      act(() => {
        store.getState().completeStep('l1', 's3')
        store.storage.flush()
      })
      expect(region).toHaveTextContent(/storage is full/i)
    },
  )

  it('explains when the browser blocks storage altogether', () => {
    render(<StorageNotice failure="unavailable" onDismiss={() => undefined} />)
    expect(screen.getByRole('status')).toHaveTextContent(/isn't letting Beyond the Glass save/)
  })
})
