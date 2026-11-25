import type { Cluster } from '../../core/cluster.ts'
import type { SimClock } from '../../core/clock.ts'
import type { LabelSelector, Labels } from '../../core/resources.ts'

export interface PrintContext {
  cluster: Cluster
  clock: SimClock
}

/** Something `kubectl get` can list: what the API object looks like and how a table row prints it. */
export interface PrintableObject {
  metadata: { name: string; namespace?: string; labels?: Labels; creationTimestamp: string }
}

/**
 * How `kubectl get` prints one resource type (E6-05). One file per type, one line in ./index.ts.
 * Column titles and cell formats follow kubectl's printers (k8s.io/kubernetes/pkg/printers/internalversion).
 */
export interface Printer<T extends PrintableObject = PrintableObject> {
  /** The plural resource name, as in RESOURCE_TYPES. */
  type: string
  /** `-o name` prefix: `pod`, `deployment.apps`, … */
  nameGroup: string
  namespaced: boolean
  list: (ctx: PrintContext, namespace: string | undefined, selector?: LabelSelector) => T[]
  columns: readonly string[]
  row: (obj: T, ctx: PrintContext) => string[]
  wideColumns?: readonly string[]
  wideRow?: (obj: T, ctx: PrintContext) => string[]
  /** The API object for `-o yaml|json` (default: the object itself). */
  toApi?: (obj: T, ctx: PrintContext) => unknown
  /** Printed on stderr whenever the type is listed (deprecations). */
  warning?: string
}

export function definePrinter<T extends PrintableObject>(p: Printer<T>): Printer {
  return p as unknown as Printer
}

export const labelsText = (l: Labels | undefined) =>
  Object.entries(l ?? {})
    .map(([k, v]) => `${k}=${v}`)
    .join(',') || '<none>'

export const selectorText = (s: LabelSelector | Labels | undefined): string => {
  if (!s) return '<none>'
  const ml =
    'matchLabels' in s || 'matchExpressions' in s
      ? ((s as LabelSelector).matchLabels ?? {})
      : (s as Labels)
  return (
    Object.entries(ml)
      .map(([k, v]) => `${k}=${v}`)
      .join(',') || '<none>'
  )
}
