import { Tabs as T } from 'radix-ui'
import type { ReactNode } from 'react'
import { cx, focusRing, target } from './styles'

export interface TabItem {
  id: string
  label: ReactNode
  content: ReactNode
}

export interface TabsProps {
  /** Names the tab list for screen readers. */
  label: string
  items: TabItem[]
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
}

/** WAI-ARIA tabs: arrow keys move between tabs, Home/End jump to the ends, Tab moves into the panel. */
export function Tabs({ label, items, value, defaultValue, onValueChange }: TabsProps) {
  return (
    <T.Root
      {...(value !== undefined ? { value } : {})}
      defaultValue={defaultValue ?? items[0]?.id}
      {...(onValueChange ? { onValueChange } : {})}
    >
      <T.List aria-label={label} className="flex flex-wrap gap-1 border-b border-line">
        {items.map((t) => (
          <T.Trigger
            key={t.id}
            value={t.id}
            className={cx(
              'rounded-t-md border-b-4 border-transparent px-4 text-ink data-[state=active]:border-accent data-[state=active]:font-bold',
              target,
              focusRing,
            )}
          >
            {t.label}
          </T.Trigger>
        ))}
      </T.List>
      {items.map((t) => (
        <T.Content key={t.id} value={t.id} className={cx('pt-4', focusRing)}>
          {t.content}
        </T.Content>
      ))}
    </T.Root>
  )
}
