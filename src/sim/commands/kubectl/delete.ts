import { STOP_MS } from '../../controllers/kubelet.ts'
import type { Cluster } from '../../core/cluster.ts'
import type { Kind } from '../../core/resources.ts'
import { matchesSelector } from '../../core/selectors.ts'
import { ownedPods, ownedReplicaSets } from '../../core/workloads.ts'
import { bool, str } from '../flags.ts'
import { parseSelector } from '../label-selector.ts'
import { defineCommand, fail, type Output } from '../types.ts'
import { target, type Target } from './globals.ts'
import { mutated, nameGroup, notFound, parseRefs, type AnyObject } from './objects.ts'

/** The kinds delete works on here; nodes and namespaces would take the whole exercise with them. */
const DELETABLE = new Set(['Pod', 'Deployment', 'ReplicaSet', 'Service', 'ConfigMap', 'Secret'])
const FORCE_WARNING =
  'Warning: Immediate deletion does not wait for confirmation that the running resource has been terminated. The resource may continue to run on the cluster indefinitely.'

/** Marks a pod for deletion; the kubelet stops its containers and removes it. */
function deletePod(cluster: Cluster, now: string, name: string, ns: string, force: boolean) {
  const pod = cluster.get('Pod', ns, name)
  if (!pod) return
  if (force) {
    cluster.delete('Pod', ns, name)
    return
  }
  if (pod.metadata.deletionTimestamp) return
  pod.metadata.deletionTimestamp = now
  cluster.put(pod)
}

/** Deletes an object and, like the garbage collector, everything it owns. */
function cascade(cluster: Cluster, t: Target, now: string, obj: AnyObject, force: boolean) {
  const ns = t.namespace
  if (obj.kind === 'Pod') {
    deletePod(cluster, now, obj.metadata.name, ns, force)
    return
  }
  if (obj.kind === 'Deployment')
    for (const rs of ownedReplicaSets(cluster, obj)) cascade(cluster, t, now, rs, force)
  if (obj.kind === 'ReplicaSet')
    for (const p of ownedPods(cluster, obj)) deletePod(cluster, now, p.metadata.name, ns, force)
  cluster.delete(obj.kind, ns, obj.metadata.name)
}

/** `kubectl delete` for pods, workloads, Services, ConfigMaps and Secrets (E6-07). */
export const kubectlDelete = defineCommand({
  path: ['kubectl', 'delete'],
  summary: 'Delete pods, Deployments, Services and other objects',
  usage: 'kubectl delete (TYPE NAME… | TYPE/NAME… | TYPE -l SELECTOR | TYPE --all) [-n NS]',
  flags: [
    { name: 'all', type: 'bool', description: 'Every object of the type in the namespace' },
    { name: 'force', type: 'bool', description: 'Remove immediately, without waiting' },
    { name: 'grace-period', type: 'string', description: 'Seconds to wait; 0 with --force' },
    { name: 'wait', type: 'string', description: 'false to return before the object is gone' },
  ],
  help: () =>
    'Delete resources by names, label selector, or all.\n\n Pods that a Deployment manages come back: its ReplicaSet notices one is missing and creates a\n replacement with a new name. To stop a workload, scale or delete the Deployment.\n\nExamples:\n  # Delete a pod (its Deployment replaces it)\n  kubectl delete pod <name> -n ravenpost\n\n  # Delete every pod with a label\n  kubectl delete pods -l app=ravenpost-notifier -n ravenpost\n\n  # Delete a Deployment, its ReplicaSets and their pods\n  kubectl delete deployment/ravenpost-notifier -n ravenpost\n\nUsage:\n  kubectl delete ([-f FILENAME] | TYPE [(NAME | -l label | --all)]) [options]',
  run: (ctx, inv): Output => {
    const t = target(ctx, inv.flags)
    if (!t.ok) return fail(t.error)
    const { cluster, namespace } = t.target
    const parsed = parseRefs(inv.args)
    if ('error' in parsed) return fail(parsed.error)
    if (!parsed.refs.length)
      return fail(
        "error: You must provide one or more resources by argument or filename.\nExample resource specifications include:\n   '-f rsrc.yaml'\n   '--filename=rsrc.json'\n   '<resource> <name>'\n   '<resource>'",
      )
    const types = [...new Set(parsed.refs.map((r) => r.type))]
    const type = types.find((x) => !DELETABLE.has(x.kind))
    if (type)
      return fail(
        `\`kubectl delete ${type.plural}\` works on a real cluster, but here it would take the exercise with it. This simulator deletes pods, deployments, replicasets, services, configmaps and secrets.`,
      )
    const selText = str(inv.flags, 'selector')
    const all = bool(inv.flags, 'all')
    const named = parsed.refs.filter((r) => r.name)
    if (!named.length && selText === undefined && !all)
      return fail(
        `error: resource(s) were provided, but no name was specified\nSee 'kubectl delete -h' for help and examples`,
      )
    const force = bool(inv.flags, 'force') && str(inv.flags, 'grace-period') === '0'
    if (bool(inv.flags, 'force') && !force)
      return fail('error: --force requires --grace-period=0 here, as with kubectl before 1.31')
    const targets: AnyObject[] = []
    const errors: string[] = []
    if (named.length) {
      for (const r of named) {
        const obj = cluster.get(r.type.kind as Kind, namespace, r.name)
        if (obj) targets.push(obj)
        else errors.push(notFound(r.type, r.name))
      }
    } else {
      const sel = selText !== undefined ? parseSelector(selText) : undefined
      if (sel && !sel.ok) return fail(sel.error)
      for (const ty of types)
        targets.push(
          ...cluster
            .list(ty.kind as Kind, { namespace })
            .filter((o) => !sel?.ok || matchesSelector(o.metadata.labels, sel.selector)),
        )
      if (!targets.length) return { stdout: '', stderr: 'No resources found', exitCode: 0 }
    }
    const now = ctx.sim.clock.iso()
    const out: string[] = []
    for (const obj of targets) {
      cascade(cluster, t.target, now, obj, force)
      const ty = types.find((x) => x.kind === obj.kind)
      out.push(`${ty ? nameGroup(ty) : obj.kind.toLowerCase()} "${obj.metadata.name}" deleted`)
      mutated(ctx, inv, t.target, {
        verb: 'delete',
        kind: obj.kind,
        name: obj.metadata.name,
        ...(obj.kind === 'Pod' && obj.metadata.ownerReferences?.[0]
          ? {
              detail: {
                owner: `${obj.metadata.ownerReferences[0].kind}/${obj.metadata.ownerReferences[0].name}`,
              },
            }
          : {}),
      })
    }
    // kubectl waits until deleted pods are gone (their containers get time to stop).
    if (!force && str(inv.flags, 'wait') !== 'false' && targets.some((o) => o.kind !== 'Service'))
      ctx.sim.advance(STOP_MS)
    const stderr = [...(force ? [FORCE_WARNING] : []), ...errors].join('\n')
    return { stdout: out.join('\n'), stderr, exitCode: errors.length ? 1 : 0 }
  },
  complete: (ctx, words, partial) => {
    const positional = words.filter((w) => !w.startsWith('-'))
    if (positional.length === 0)
      return ['pod', 'deployment', 'replicaset', 'service', 'configmap', 'secret'].filter((x) =>
        x.startsWith(partial),
      )
    if (positional[0] === 'pod' || positional[0] === 'pods' || positional[0] === 'po')
      return ctx.sim
        .cluster()
        .list('Pod', { namespace: ctx.sim.namespace() })
        .map((p) => p.metadata.name)
        .filter((n) => n.startsWith(partial))
    return []
  },
})
