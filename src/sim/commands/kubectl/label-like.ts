import type { Labels } from '../../core/resources.ts'
import { bool } from '../flags.ts'
import { fail, ok, type CommandDef } from '../types.ts'
import { target } from './globals.ts'
import { getObject, mutated, notFound, parseRefs, slashName } from './objects.ts'

/** A label key: an optional DNS prefix and a name of up to 63 alphanumerics, `-`, `_` and `.`. */
const KEY =
  /^([a-z0-9]([-a-z0-9]*[a-z0-9])?(\.[a-z0-9]([-a-z0-9]*[a-z0-9])?)*\/)?[A-Za-z0-9]([-A-Za-z0-9_.]{0,61}[A-Za-z0-9])?$/
const LABEL_VALUE = /^([A-Za-z0-9]([-A-Za-z0-9_.]{0,61}[A-Za-z0-9])?)?$/
const isChange = (w: string) => /^[^/=]*(\/[^=]*)?=/.test(w) || w.endsWith('-')

/** `kubectl label` and `kubectl annotate` (E6-07) share everything but the field they change. */
export function labelLike(kind: 'label' | 'annotate'): CommandDef {
  const field = kind === 'label' ? 'labels' : 'annotations'
  const done = kind === 'label' ? 'labeled' : 'annotated'
  const example =
    kind === 'label'
      ? `  # Add a label (a pod that no longer matches its ReplicaSet's selector is replaced)
  kubectl label pod <name> -n ravenpost debug=true

  # Change one, then remove it
  kubectl label pod <name> -n ravenpost debug=false --overwrite
  kubectl label pod <name> -n ravenpost debug-`
      : `  # Note why something changed
  kubectl annotate deployment/ravenpost-api -n ravenpost kubernetes.io/change-cause="roll back to 1.14.0"`
  return {
    path: ['kubectl', kind],
    summary:
      kind === 'label' ? 'Add, change or remove labels' : 'Add, change or remove annotations',
    usage: `kubectl ${kind} TYPE NAME KEY=VALUE … [KEY-] [--overwrite] [-n NS]`,
    flags: [{ name: 'overwrite', type: 'bool', description: 'Allow changing an existing value' }],
    help: () =>
      `Update the ${field} on a resource.\n\nExamples:\n${example}\n\nUsage:\n  kubectl ${kind} [--overwrite] (-f FILENAME | TYPE NAME) KEY_1=VAL_1 ... KEY_N=VAL_N [options]`,
    run: (ctx, inv) => {
      const t = target(ctx, inv.flags)
      if (!t.ok) return fail(t.error)
      const parsed = parseRefs(inv.args, isChange)
      if ('error' in parsed) return fail(parsed.error)
      const changes = parsed.rest
      if (!parsed.refs.length || parsed.refs.some((r) => !r.name))
        return fail(
          `error: one or more resources must be specified as <resource> <name> or <resource>/<name>`,
        )
      if (!changes.length)
        return fail(
          `error: at least one ${kind === 'label' ? 'label' : 'annotation'} update is required`,
        )
      const set: Record<string, string> = {}
      const remove: string[] = []
      for (const c of changes) {
        if (c.endsWith('-') && !c.includes('=')) {
          remove.push(c.slice(0, -1))
          continue
        }
        const eq = c.indexOf('=')
        const key = c.slice(0, eq)
        const value = c.slice(eq + 1)
        if (!KEY.test(key))
          return fail(`error: invalid ${kind === 'label' ? 'label' : 'annotation'} spec: ${c}`)
        if (kind === 'label' && !LABEL_VALUE.test(value))
          return fail(
            `error: invalid label value: "${c}": a valid label must be an empty string or consist of alphanumeric characters, '-', '_' or '.', and must start and end with an alphanumeric character`,
          )
        set[key] = value
      }
      const out: string[] = []
      for (const ref of parsed.refs) {
        const obj = getObject(t.target.cluster, t.target, ref)
        if (!obj) return fail(notFound(ref.type, ref.name))
        const before: Labels = { ...obj.metadata[field] }
        for (const [k, v] of Object.entries(set))
          if (k in before && before[k] !== v && !bool(inv.flags, 'overwrite'))
            return fail(
              `error: '${k}' already has a value (${before[k] ?? ''}), and --overwrite is false`,
            )
        const after: Labels = { ...before, ...set }
        for (const k of remove) Reflect.deleteProperty(after, k)
        const changed = JSON.stringify(after) !== JSON.stringify(before)
        if (changed) {
          obj.metadata[field] = after
          t.target.cluster.put(obj)
          mutated(ctx, inv, t.target, {
            verb: kind,
            kind: obj.kind,
            name: ref.name,
            namespaced: ref.type.namespaced,
            detail: { set, remove },
          })
        }
        out.push(`${slashName(ref.type, ref.name)} ${changed ? done : `not ${done}`}`)
      }
      return ok(out.join('\n'))
    },
  }
}
