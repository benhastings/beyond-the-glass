import { useMemo, useRef, useState, type KeyboardEvent } from 'react'
import type { TreeNode } from '@/sim/gitops/tree'
import { cx, focusRing } from '../../ui/styles'
import { HealthPill, KIND_SHORT, SyncPill } from './status'

interface Row {
  node: TreeNode
  level: number
  setSize: number
  posInSet: number
  parent?: string
}

/** Every node in document order, with its place in the tree. */
function rows(root: TreeNode): Row[] {
  const out: Row[] = []
  const walk = (n: TreeNode, level: number, setSize: number, posInSet: number, parent?: string) => {
    out.push({ node: n, level, setSize, posInSet, ...(parent ? { parent } : {}) })
    n.children.forEach((c, i) => {
      walk(c, level + 1, n.children.length, i + 1, n.id)
    })
  }
  walk(root, 1, 1, 1)
  return out
}

/**
 * The application's resource tree as a WAI-ARIA tree (E7-05.AC1): one tab stop; Up/Down move, Right opens a
 * branch or moves into it, Left closes it or moves to the parent, Home/End jump, Enter or Space selects.
 */
export function ResourceTree({
  root,
  label,
  selected,
  onSelect,
}: {
  root: TreeNode
  label: string
  selected?: string
  onSelect: (node: TreeNode) => void
}) {
  const all = useMemo(() => rows(root), [root])
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set())
  const [focus, setFocus] = useState(root.id)
  const refs = useRef(new Map<string, HTMLDivElement>())
  // Visible rows: those with no collapsed ancestor.
  const visible = useMemo(() => {
    const hidden = new Set<string>()
    return all.filter((r) => {
      if (r.parent && (collapsed.has(r.parent) || hidden.has(r.parent))) {
        hidden.add(r.node.id)
        return false
      }
      return true
    })
  }, [all, collapsed])
  const current = visible.some((r) => r.node.id === focus) ? focus : root.id
  const move = (id: string | undefined) => {
    if (!id) return
    setFocus(id)
    refs.current.get(id)?.focus()
  }
  const toggle = (id: string, open: boolean) => {
    setCollapsed((c) => {
      const next = new Set(c)
      if (open) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const onKeyDown = (e: KeyboardEvent, r: Row, i: number) => {
    const hasKids = r.node.children.length > 0
    const open = hasKids && !collapsed.has(r.node.id)
    switch (e.key) {
      case 'ArrowDown':
        move(visible[i + 1]?.node.id)
        break
      case 'ArrowUp':
        move(visible[i - 1]?.node.id)
        break
      case 'Home':
        move(visible[0]?.node.id)
        break
      case 'End':
        move(visible.at(-1)?.node.id)
        break
      case 'ArrowRight':
        if (hasKids && !open) toggle(r.node.id, true)
        else if (open) move(r.node.children[0]?.id)
        break
      case 'ArrowLeft':
        if (open) toggle(r.node.id, false)
        else move(r.parent)
        break
      case 'Enter':
      case ' ':
        onSelect(r.node)
        break
      default:
        return
    }
    e.preventDefault()
  }
  return (
    <div role="tree" aria-label={label} className="grid gap-1">
      {visible.map((r, i) => {
        const hasKids = r.node.children.length > 0
        const open = hasKids && !collapsed.has(r.node.id)
        return (
          <div
            key={r.node.id}
            ref={(el) => {
              if (el) refs.current.set(r.node.id, el)
              else refs.current.delete(r.node.id)
            }}
            role="treeitem"
            aria-level={r.level}
            aria-setsize={r.setSize}
            aria-posinset={r.posInSet}
            aria-selected={selected === r.node.id}
            {...(hasKids ? { 'aria-expanded': open } : {})}
            tabIndex={r.node.id === current ? 0 : -1}
            onKeyDown={(e) => {
              onKeyDown(e, r, i)
            }}
            onClick={() => {
              setFocus(r.node.id)
              onSelect(r.node)
            }}
            onFocus={() => {
              setFocus(r.node.id)
            }}
            style={{ paddingInlineStart: `${String((r.level - 1) * 1.5)}rem` }}
            className={cx('cursor-pointer rounded-md', focusRing)}
          >
            <span
              className={cx(
                'flex flex-wrap items-center gap-2 rounded-md border-2 border-line bg-raised p-2',
                selected === r.node.id && 'border-accent',
              )}
            >
              <span aria-hidden="true" className="w-4 text-center">
                {hasKids ? (open ? '▾' : '▸') : ''}
              </span>
              {/* Its name comes from this text: "Deployment web Healthy Synced". */}
              <span className="rounded-pill border border-line px-2 font-mono text-xs">
                <span aria-hidden="true">{KIND_SHORT[r.node.kind] ?? r.node.kind}</span>
                <span className="sr-only">{r.node.kind}</span>
              </span>{' '}
              <span className="font-mono">{r.node.name}</span>{' '}
              {r.node.health && <HealthPill health={r.node.health} />}{' '}
              {r.node.sync && <SyncPill sync={r.node.sync} />}
            </span>
          </div>
        )
      })}
    </div>
  )
}
