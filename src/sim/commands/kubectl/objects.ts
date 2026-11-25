import { recordMutation } from '../../core/audit.ts'
import type { Cluster } from '../../core/cluster.ts'
import type { Kind, KindMap } from '../../core/resources.ts'
import { suggest } from '../distance.ts'
import { printerFor } from '../printers/index.ts'
import { allTypeNames, resolveType, type ResourceType } from '../resource-types.ts'
import type { CommandContext, Invocation } from '../types.ts'
import type { Target } from './globals.ts'

/** Shared by the commands that change things (E6-07): finding objects, naming them, auditing. */

export type AnyObject = KindMap[Kind]

export interface Ref {
  type: ResourceType
  name: string
}

/** The API group suffix kubectl prints: `deployments.apps`, `pods`. */
export const groupOf = (t: ResourceType) =>
  (printerFor(t.plural)?.nameGroup ?? t.singular).replace(/^[^.]+/, t.plural)
/** `deployment.apps`, `pod`: kubectl's name for one object of the type. */
export const nameGroup = (t: ResourceType) => printerFor(t.plural)?.nameGroup ?? t.singular
/** `deployment.apps/web`, `pod/web-1`: how mutating commands name what they changed. */
export const slashName = (t: ResourceType, name: string) => `${nameGroup(t)}/${name}`

export const notFound = (t: ResourceType, name: string) =>
  `Error from server (NotFound): ${groupOf(t)} "${name}" not found`

function unknownType(word: string): string {
  const close = suggest(word, allTypeNames())
  return `error: the server doesn't have a resource type "${word}"${close[0] ? `\n\nDid you mean \`${close[0]}\`?` : ''}`
}

/**
 * Reads `TYPE NAME [NAME…]` or `TYPE/NAME [TYPE/NAME…]` from the front of `args`, as kubectl does.
 * Returns the refs and whatever arguments follow them (`key=value` pairs for label, set image).
 */
export function parseRefs(
  args: readonly string[],
  isRest: (word: string) => boolean = () => false,
): { refs: Ref[]; rest: string[] } | { error: string } {
  const [first] = args
  if (!first) return { refs: [], rest: [] }
  const refs: Ref[] = []
  let i = 0
  if (first.includes('/')) {
    for (; i < args.length && (args[i] ?? '').includes('/') && !isRest(args[i] ?? ''); i++) {
      const [typeWord = '', name = ''] = (args[i] ?? '').split('/')
      const type = resolveType(typeWord)
      if (!type) return { error: unknownType(typeWord) }
      refs.push({ type, name })
    }
  } else {
    const types: ResourceType[] = []
    for (const word of first.split(',')) {
      const type = resolveType(word)
      if (!type) return { error: unknownType(word) }
      types.push(type)
    }
    const names: string[] = []
    for (i = 1; i < args.length && !isRest(args[i] ?? ''); i++) names.push(args[i] ?? '')
    // `TYPE` alone (for -l or --all) is a ref with no name; several types apply to every name.
    for (const type of types)
      if (!names.length) refs.push({ type, name: '' })
      else for (const name of names) refs.push({ type, name })
  }
  return { refs, rest: args.slice(i) }
}

export function getObject(cluster: Cluster, t: Target, ref: Ref): AnyObject | undefined {
  return cluster.get(ref.type.kind as Kind, ref.type.namespaced ? t.namespace : undefined, ref.name)
}

/** Records a learner's change in the audit log and lets the controllers react to it. */
export function mutated(
  ctx: CommandContext,
  inv: Invocation,
  t: Target,
  e: {
    verb: string
    kind: string
    name: string
    namespaced?: boolean
    detail?: Record<string, unknown>
  },
): void {
  recordMutation(ctx.sim, {
    actor: 'learner',
    cluster: t.cluster.name,
    verb: e.verb,
    kind: e.kind,
    ...(e.namespaced === false ? {} : { namespace: t.namespace }),
    name: e.name,
    command: [...inv.path, ...inv.args].join(' '),
    ...(e.detail ? { detail: e.detail } : {}),
  })
  ctx.sim.reconcile()
}
