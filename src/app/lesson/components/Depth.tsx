import { Children, isValidElement, type ReactElement, type ReactNode } from 'react'
import type { Depth as DepthLevel, Level } from '@/progress'
import { useProgress } from '../../progress'
import { Tabs } from '../../ui/Tabs'
import { useLessonInfo } from '../lesson-context'

interface Layer {
  depth: DepthLevel
  label: string
}

/** Which layer a placement level starts on (E5-05): newcomers get plain words, experts the deep dive. */
export const DEPTH_FOR_LEVEL: Readonly<Record<Level, DepthLevel>> = {
  wayfarer: 'eli5',
  deckhand: 'operator',
  navigator: 'operator',
  pathfinder: 'deep',
}
/** Before the Threshold is taken: the operator view, which respects what the learner already knows. */
export const DEFAULT_DEPTH: DepthLevel = 'operator'

/**
 * `<Depth>` with `<ELI5>`, `<Operator>` and `<DeepDive>` inside, shown as tabs (WAI-ARIA tabs pattern).
 * It opens on the layer the learner last chose in this domain, otherwise the one their placement level
 * suggests; choosing a tab is remembered for the domain. A missing layer is simply not offered.
 */
export function Depth({ children }: { children: ReactNode }) {
  const { domain = 'general' } = useLessonInfo()
  const remembered = useProgress((s) => s.progress.settings.depthByDomain?.[domain])
  const level = useProgress(
    (s) => s.progress.threshold.overrides[domain] ?? s.progress.threshold.placement?.[domain],
  )
  const updateSettings = useProgress((s) => s.updateSettings)
  const all = useProgress((s) => s.progress.settings.depthByDomain)
  const layers = Children.toArray(children).filter(
    (c): c is ReactElement<{ children: ReactNode }> & { type: Layer } =>
      isValidElement(c) && typeof c.type === 'function' && 'depth' in c.type,
  )
  const ids = layers.map((l) => l.type.depth)
  const wanted = remembered ?? (level ? DEPTH_FOR_LEVEL[level] : DEFAULT_DEPTH)
  // If the wanted layer is missing, the nearest one in eli5 → operator → deep order.
  const order: DepthLevel[] = ['eli5', 'operator', 'deep']
  const value = ids.includes(wanted)
    ? wanted
    : (order.slice(order.indexOf(wanted)).find((d) => ids.includes(d)) ?? ids.at(-1) ?? wanted)
  if (!layers.length) return null
  return (
    <div className="rounded-md border border-line p-3">
      <Tabs
        label="How deep to go"
        value={value}
        onValueChange={(v) => {
          updateSettings({ depthByDomain: { ...all, [domain]: v as DepthLevel } })
        }}
        items={layers.map((l) => ({
          id: l.type.depth,
          label: l.type.label,
          content: l.props.children,
        }))}
      />
    </div>
  )
}
