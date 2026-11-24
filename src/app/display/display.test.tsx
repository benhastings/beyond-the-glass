import { act, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyDisplay, applyTheme, displayAttributes } from './display'
import { useDisplayPreferences } from './useDisplayPreferences'
import { useProgress } from '../progress'

const base = { reduceMotion: 'system', highContrast: 'system', textSize: 100 } as const

describe('displayAttributes', () => {
  it('follows the operating system when settings say "system"', () => {
    expect(displayAttributes(base, { reducedMotion: false, moreContrast: false })).toEqual({
      motion: 'full',
      contrast: 'normal',
      fontSize: '100%',
    })
    expect(displayAttributes(base, { reducedMotion: true, moreContrast: true })).toEqual({
      motion: 'reduce',
      contrast: 'more',
      fontSize: '100%',
    })
  })

  it('lets the learner override the operating system either way', () => {
    const env = { reducedMotion: true, moreContrast: true }
    expect(
      displayAttributes({ ...base, reduceMotion: 'off', highContrast: 'off' }, env),
    ).toMatchObject({ motion: 'full', contrast: 'normal' })
    expect(
      displayAttributes(
        { ...base, reduceMotion: 'on', highContrast: 'on', textSize: 130 },
        { reducedMotion: false, moreContrast: false },
      ),
    ).toEqual({ motion: 'reduce', contrast: 'more', fontSize: '130%' })
  })
})

describe('applying to <html>', () => {
  const root = document.documentElement
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sets the attributes and font size', () => {
    applyDisplay(root, { motion: 'reduce', contrast: 'more', fontSize: '115%' })
    expect(root.dataset.motion).toBe('reduce')
    expect(root.dataset.contrast).toBe('more')
    expect(root.style.fontSize).toBe('115%')
    applyTheme(root, 'reach', 'harbor')
    expect([root.dataset.mood, root.dataset.region]).toEqual(['reach', 'harbor'])
    applyTheme(root, 'console', undefined)
    expect(root.dataset.mood).toBe('console')
    expect(root.dataset.region).toBeUndefined()
  })

  it('useDisplayPreferences tracks settings and OS media queries', () => {
    const listeners: Record<string, () => void> = {}
    const state: Record<string, boolean> = {
      '(prefers-reduced-motion: reduce)': false,
      '(prefers-contrast: more)': false,
    }
    vi.stubGlobal('matchMedia', (q: string) => ({
      get matches() {
        return state[q] ?? false
      },
      addEventListener: (_: string, f: () => void) => {
        listeners[q] = f
      },
      removeEventListener: () => undefined,
    }))
    function Probe() {
      useDisplayPreferences()
      return null
    }
    render(<Probe />)
    expect(root.dataset.motion).toBe('full')
    act(() => {
      state['(prefers-reduced-motion: reduce)'] = true
      listeners['(prefers-reduced-motion: reduce)']?.()
    })
    expect(root.dataset.motion).toBe('reduce')
    act(() => {
      useProgress.getState().updateSettings({ textSize: 130, highContrast: 'on' })
    })
    expect(root.style.fontSize).toBe('130%')
    expect(root.dataset.contrast).toBe('more')
    act(() => {
      useProgress
        .getState()
        .updateSettings({ textSize: 100, highContrast: 'system', reduceMotion: 'off' })
    })
    expect(root.dataset.motion).toBe('full')
  })
})
