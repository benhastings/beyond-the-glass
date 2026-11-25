import { str } from '../flags.ts'
import { defineCommand, fail, ok } from '../types.ts'
import { target } from './globals.ts'
import { mutated, notFound, parseRefs, slashName } from './objects.ts'

/** `kubectl scale` for Deployments and ReplicaSets (E6-07). */
export const kubectlScale = defineCommand({
  path: ['kubectl', 'scale'],
  summary: 'Change how many replicas a Deployment runs',
  usage: 'kubectl scale deployment/NAME --replicas=N [-n NS]',
  flags: [
    { name: 'replicas', type: 'string', description: 'The new number of replicas' },
    {
      name: 'current-replicas',
      type: 'string',
      description: 'Only scale if it currently has this many',
    },
  ],
  help: () =>
    'Set a new size for a deployment or replica set.\n\nExamples:\n  # Run 3 replicas of the api\n  kubectl scale deployment/ravenpost-api --replicas=3 -n ravenpost\n\n  # Only if it currently has 2\n  kubectl scale --current-replicas=2 --replicas=3 deployment/ravenpost-api -n ravenpost\n\nUsage:\n  kubectl scale [--current-replicas=count] --replicas=COUNT (TYPE NAME | TYPE/NAME) [options]',
  run: (ctx, inv) => {
    const replicasText = str(inv.flags, 'replicas')
    if (replicasText === undefined) return fail('error: required flag(s) "replicas" not set')
    const replicas = Number(replicasText)
    if (!Number.isInteger(replicas) || replicas < 0)
      return fail(
        Number.isInteger(replicas)
          ? 'error: The --replicas=COUNT flag is required, and COUNT must be greater than or equal to 0'
          : `error: invalid argument "${replicasText}" for "--replicas" flag: strconv.ParseInt: parsing "${replicasText}": invalid syntax`,
      )
    const t = target(ctx, inv.flags)
    if (!t.ok) return fail(t.error)
    const parsed = parseRefs(inv.args)
    if ('error' in parsed) return fail(parsed.error)
    if (!parsed.refs.length || parsed.refs.some((r) => !r.name))
      return fail(
        "error: resource(s) were provided, but no name was specified\nSee 'kubectl scale -h' for help and examples",
      )
    const out: string[] = []
    const errors: string[] = []
    const current = str(inv.flags, 'current-replicas')
    for (const ref of parsed.refs) {
      if (ref.type.kind !== 'Deployment' && ref.type.kind !== 'ReplicaSet') {
        errors.push(`error: no scaler has been implemented for {"" "${ref.type.kind}"}`)
        continue
      }
      const obj =
        ref.type.kind === 'Deployment'
          ? t.target.cluster.get('Deployment', t.target.namespace, ref.name)
          : t.target.cluster.get('ReplicaSet', t.target.namespace, ref.name)
      if (!obj) {
        errors.push(notFound(ref.type, ref.name))
        continue
      }
      if (current !== undefined && Number(current) !== obj.spec.replicas) {
        errors.push(`error: Expected replicas to be ${current}, was ${String(obj.spec.replicas)}`)
        continue
      }
      const from = obj.spec.replicas
      obj.spec.replicas = replicas
      if (obj.kind === 'Deployment') t.target.cluster.put(obj)
      else t.target.cluster.put(obj)
      mutated(ctx, inv, t.target, {
        verb: 'scale',
        kind: obj.kind,
        name: ref.name,
        detail: { from, to: replicas },
      })
      out.push(`${slashName(ref.type, ref.name)} scaled`)
    }
    return errors.length
      ? { stdout: out.join('\n'), stderr: errors.join('\n'), exitCode: 1 }
      : ok(out.join('\n'))
  },
})
