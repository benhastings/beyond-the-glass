import type { LabelSelector, Labels } from './resources.ts'

/** Whether `labels` satisfy a Kubernetes LabelSelector (matchLabels and matchExpressions). */
export function matchesSelector(
  labels: Labels | undefined,
  selector: LabelSelector | undefined,
): boolean {
  if (!selector) return false
  const l = labels ?? {}
  for (const [k, v] of Object.entries(selector.matchLabels ?? {})) if (l[k] !== v) return false
  for (const e of selector.matchExpressions ?? []) {
    const has = Object.hasOwn(l, e.key)
    const values = e.values ?? []
    switch (e.operator) {
      case 'In':
        if (!has || !values.includes(l[e.key] ?? '')) return false
        break
      case 'NotIn':
        if (has && values.includes(l[e.key] ?? '')) return false
        break
      case 'Exists':
        if (!has) return false
        break
      case 'DoesNotExist':
        if (has) return false
        break
    }
  }
  return true
}

/** A Service-style selector (plain map): empty or missing selects nothing. */
export function matchesMap(labels: Labels | undefined, selector: Labels | undefined): boolean {
  if (!selector || Object.keys(selector).length === 0) return false
  return matchesSelector(labels, { matchLabels: selector })
}
