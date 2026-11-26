import { describe, expect, it } from 'vitest'
import {
  bringUp,
  DEFAULT_LAYOUT,
  LAYOUT_KEY,
  loadLayout,
  saveLayout,
  visiblePanes,
  type Layout,
} from './layout'

const store = (init: Record<string, string> = {}) => {
  const m = new Map(Object.entries(init))
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    m,
  }
}

describe('war room layout', () => {
  it('round-trips, and falls back to the default for anything it does not understand', () => {
    const s = store()
    const l: Layout = { preset: '3-up', slots: ['terminal', 'argo', 'notes'], maximized: 'argo' }
    saveLayout(s, l)
    expect(loadLayout(s)).toEqual(l)
    for (const bad of [
      'nope{',
      'null',
      '{"preset":"4-up","slots":["terminal","argo","notes"]}',
      '{"preset":"2-up","slots":["terminal"]}',
      '{"preset":"2-up","slots":["a","b","c"]}',
    ])
      expect(loadLayout(store({ [LAYOUT_KEY]: bad }))).toEqual(DEFAULT_LAYOUT)
    expect(loadLayout(undefined)).toEqual(DEFAULT_LAYOUT)
    expect(
      loadLayout(
        store({
          [LAYOUT_KEY]: '{"preset":"2-up","slots":["terminal","argo","notes"],"maximized":"x"}',
        }),
      ),
    ).toEqual({ preset: '2-up', slots: ['terminal', 'argo', 'notes'] })
    expect(() => {
      saveLayout(
        {
          setItem: () => {
            throw new Error('blocked')
          },
        },
        l,
      )
    }).not.toThrow()
  })

  it('shows two or three panes, or the maximized one, and brings a pane up into the first slot', () => {
    expect(visiblePanes(DEFAULT_LAYOUT)).toEqual(['incident', 'terminal'])
    expect(visiblePanes({ ...DEFAULT_LAYOUT, preset: '3-up' })).toEqual([
      'incident',
      'terminal',
      'dashboards',
    ])
    expect(visiblePanes({ ...DEFAULT_LAYOUT, maximized: 'notes' })).toEqual(['notes'])
    expect(bringUp(DEFAULT_LAYOUT, 'terminal')).toBe(DEFAULT_LAYOUT)
    expect(bringUp(DEFAULT_LAYOUT, 'dashboards').slots).toEqual([
      'dashboards',
      'terminal',
      'incident',
    ])
    expect(bringUp(DEFAULT_LAYOUT, 'argo').slots).toEqual(['argo', 'terminal', 'dashboards'])
    expect(bringUp({ ...DEFAULT_LAYOUT, maximized: 'notes' }, 'argo').maximized).toBe('argo')
  })
})
