/** The war room's panes (E10-04), in shortcut order: Alt+1 is the first. */
export const PANES = [
  { id: 'incident', title: 'The incident' },
  { id: 'terminal', title: 'Terminal' },
  { id: 'argo', title: 'Argo CD' },
  { id: 'changes', title: 'Pipelines and merge requests' },
  { id: 'dashboards', title: 'Dashboards' },
  { id: 'explore', title: 'Explore logs and traces' },
  { id: 'notes', title: 'Incident notes' },
] as const
export type PaneId = (typeof PANES)[number]['id']

export interface Layout {
  preset: '2-up' | '3-up'
  /** Which pane each slot shows. */
  slots: [PaneId, PaneId, PaneId]
  maximized?: PaneId
}

export const DEFAULT_LAYOUT: Layout = {
  preset: '2-up',
  slots: ['incident', 'terminal', 'dashboards'],
}
export const LAYOUT_KEY = 'btg:war-room-layout'

const isPane = (v: unknown): v is PaneId => PANES.some((p) => p.id === v)

/** The saved layout, or the default when there's none (or it doesn't make sense any more). */
export function loadLayout(storage: Pick<Storage, 'getItem'> | undefined): Layout {
  try {
    const raw = JSON.parse(storage?.getItem(LAYOUT_KEY) ?? 'null') as Record<string, unknown> | null
    const slots: unknown = raw?.slots
    if (
      !raw ||
      (raw.preset !== '2-up' && raw.preset !== '3-up') ||
      !Array.isArray(slots) ||
      slots.length !== 3
    )
      return DEFAULT_LAYOUT
    const [a, b, c] = slots as unknown[]
    if (!isPane(a) || !isPane(b) || !isPane(c)) return DEFAULT_LAYOUT
    return {
      preset: raw.preset,
      slots: [a, b, c],
      ...(isPane(raw.maximized) ? { maximized: raw.maximized } : {}),
    }
  } catch {
    return DEFAULT_LAYOUT
  }
}

export function saveLayout(storage: Pick<Storage, 'setItem'> | undefined, layout: Layout): void {
  try {
    storage?.setItem(LAYOUT_KEY, JSON.stringify(layout))
  } catch {
    // Storage blocked: the layout lasts for this visit.
  }
}

/** The panes on screen, in order. */
export const visiblePanes = (l: Layout): PaneId[] =>
  l.maximized ? [l.maximized] : l.slots.slice(0, l.preset === '3-up' ? 3 : 2)

/** Shows `pane` (in the first slot if it isn't already showing). */
export function bringUp(l: Layout, pane: PaneId): Layout {
  if (l.maximized && l.maximized !== pane) return { ...l, maximized: pane }
  if (visiblePanes(l).includes(pane)) return l
  const slots = [...l.slots] as Layout['slots']
  const at = slots.indexOf(pane)
  if (at >= 0) slots[at] = slots[0]
  slots[0] = pane
  return { ...l, slots }
}
