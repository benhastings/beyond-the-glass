import type { Pod } from '../../core/resources.ts'
import { matchesSelector } from '../../core/selectors.ts'
import { parseDuration } from '../../core/duration.ts'
import { containerLogs, type LogLine } from '../../telemetry/logs.ts'
import { bool, str } from '../flags.ts'
import { parseSelector } from '../label-selector.ts'
import { defineCommand, fail, type Output } from '../types.ts'
import { target } from './globals.ts'

const HELP = `Print the logs for a container in a pod or specified resource.

Examples:
  # The logs of a pod with one container
  kubectl logs <pod> -n ravenpost

  # The logs of the container that crashed before the current one (CrashLoopBackOff)
  kubectl logs <pod> -n ravenpost --previous

  # The last 20 lines, or the last 5 minutes
  kubectl logs <pod> -n ravenpost --tail=20
  kubectl logs <pod> -n ravenpost --since=5m

  # A pod of a deployment, or every pod with a label
  kubectl logs deploy/ravenpost-api -n ravenpost
  kubectl logs -l app=ravenpost-api -n ravenpost --prefix

Options:
  -c, --container='': Print the logs of this container
  -p, --previous=false: Print the logs of the previous instance of the container
      --tail=-1: Lines of recent log file to display (with -l, defaults to 10)
      --since=0s: Only return logs newer than a relative duration like 5s, 2m, or 3h
  -f, --follow=false: Stream the logs (here: for 30 seconds of simulated time)
      --timestamps=false: Include timestamps on each line
      --prefix=false: Prefix each line with the pod and container name
  -l, --selector='': Selector (label query) to filter on

Usage:
  kubectl logs [-f] [-p] (POD | TYPE/NAME) [-c CONTAINER] [options]`

/** How long `-f` follows, in simulated time. */
export const FOLLOW_MS = 30_000

function choosePods(
  pods: Pod[],
  arg: string | undefined,
  selectorText: string | undefined,
): { pods: Pod[]; note?: string } | { error: string } {
  if (selectorText !== undefined) {
    const sel = parseSelector(selectorText)
    if (!sel.ok) return { error: sel.error }
    return { pods: pods.filter((p) => matchesSelector(p.metadata.labels, sel.selector)) }
  }
  if (!arg)
    return {
      error:
        "error: expected 'logs [-f] [-p] (POD | TYPE/NAME) [-c CONTAINER]'.\nPOD or TYPE/NAME is a required argument for the logs command\nSee 'kubectl logs -h' for help and examples",
    }
  const [kind, name] = arg.includes('/') ? (arg.split('/') as [string, string]) : ['pod', arg]
  if (['pod', 'pods', 'po'].includes(kind)) {
    const p = pods.find((x) => x.metadata.name === name)
    return p ? { pods: [p] } : { error: `Error from server (NotFound): pods "${name}" not found` }
  }
  if (['deploy', 'deployment', 'deployments', 'rs', 'replicaset', 'replicasets'].includes(kind)) {
    const owned = pods
      .filter(
        (p) =>
          p.metadata.name.startsWith(`${name}-`) &&
          p.metadata.ownerReferences?.some((o) => o.kind === 'ReplicaSet'),
      )
      .sort((a, b) => (a.metadata.creationTimestamp < b.metadata.creationTimestamp ? -1 : 1))
    const group = kind.startsWith('d') ? 'deployments.apps' : 'replicasets.apps'
    if (!owned.length) return { error: `error: ${group} "${name}" not found` }
    const first = owned[0] as Pod
    return {
      pods: [first],
      ...(owned.length > 1
        ? { note: `Found ${String(owned.length)} pods, using pod/${first.metadata.name}` }
        : {}),
    }
  }
  return {
    error: `error: cannot get the logs from ${kind}: selector for ${kind} not implemented in this simulator`,
  }
}

/** `kubectl logs` (E6-06), from the shared log source E8-04 also reads. */
export const kubectlLogs = defineCommand({
  path: ['kubectl', 'logs'],
  summary: 'Print the logs of a container in a pod',
  usage:
    'kubectl logs (POD | deploy/NAME | -l SELECTOR) [-c CONTAINER] [-p] [--tail N] [--since 5m] [-f]',
  flags: [
    { name: 'container', short: 'c', type: 'string', description: 'Container name' },
    { name: 'previous', short: 'p', type: 'bool', description: 'Previous container instance' },
    { name: 'tail', type: 'string', description: 'Lines to show' },
    { name: 'since', type: 'string', description: 'Only logs newer than this, e.g. 5m' },
    { name: 'follow', short: 'f', type: 'bool', description: 'Stream new lines' },
    { name: 'timestamps', type: 'bool', description: 'Prefix each line with its timestamp' },
    { name: 'prefix', type: 'bool', description: 'Prefix each line with pod and container' },
    { name: 'all-containers', type: 'bool', description: 'Every container in the pod' },
  ],
  help: () => HELP,
  run: (ctx, inv): Output => {
    const t = target(ctx, inv.flags)
    if (!t.ok) return fail(t.error)
    const { cluster, namespace } = t.target
    const sim = ctx.sim
    const pods = cluster.list('Pod', { namespace })
    const selector = str(inv.flags, 'selector')
    const chosen = choosePods(pods, inv.args[0], selector)
    if ('error' in chosen) return fail(chosen.error)
    if (!chosen.pods.length)
      return { stdout: '', stderr: `No resources found in ${namespace} namespace.`, exitCode: 0 }
    const tailText = str(inv.flags, 'tail')
    const tail = tailText !== undefined ? Number(tailText) : selector !== undefined ? 10 : -1
    if (!Number.isInteger(tail))
      return fail(
        `error: invalid argument "${tailText ?? ''}" for "--tail" flag: strconv.ParseInt: parsing "${tailText ?? ''}": invalid syntax`,
      )
    const sinceText = str(inv.flags, 'since')
    let since: number | undefined
    if (sinceText !== undefined) {
      try {
        since = sim.now - Math.abs(parseDuration(sinceText))
      } catch {
        return fail(
          `error: invalid argument "${sinceText}" for "--since" flag: time: invalid duration "${sinceText}"`,
        )
      }
    }
    const notes: string[] = chosen.note ? [chosen.note] : []
    const containerFlag = str(inv.flags, 'container')
    const out: string[] = []
    const format = (pod: Pod, container: string, l: LogLine) =>
      `${bool(inv.flags, 'prefix') ? `[pod/${pod.metadata.name}/${container}] ` : ''}${bool(inv.flags, 'timestamps') ? `${new Date(sim.clock.epochMs + l.t).toISOString().replace('Z', '000000Z')} ` : ''}${l.text}`
    const collect = (window?: { after: number }) => {
      const lines: string[] = []
      for (const pod of chosen.pods) {
        const names = pod.spec.containers.map((c) => c.name)
        let containers: string[]
        if (bool(inv.flags, 'all-containers')) containers = names
        else if (containerFlag !== undefined) {
          if (!names.includes(containerFlag))
            return {
              error: `Error from server (BadRequest): container "${containerFlag}" is not valid for pod "${pod.metadata.name}"`,
            }
          containers = [containerFlag]
        } else {
          containers = [names[0] ?? '']
          if (names.length > 1 && !window)
            notes.push(`Defaulted container "${names[0] ?? ''}" out of: ${names.join(', ')}`)
        }
        for (const c of containers) {
          const r = containerLogs(sim, pod, c, { previous: bool(inv.flags, 'previous') })
          if (!r.ok) return { error: r.error }
          let ls = r.lines
          const from = since
          if (from !== undefined) ls = ls.filter((l) => l.t >= from)
          if (window) ls = ls.filter((l) => l.t > window.after)
          else if (tail >= 0) ls = ls.slice(Math.max(0, ls.length - tail))
          lines.push(...ls.map((l) => format(pod, c, l)))
        }
      }
      return { lines }
    }
    const first = collect()
    if ('error' in first)
      return { stdout: '', stderr: [...notes, first.error].join('\n'), exitCode: 1 }
    out.push(...first.lines)
    if (bool(inv.flags, 'follow') && !bool(inv.flags, 'previous')) {
      const startedAt = sim.now
      sim.advance(FOLLOW_MS)
      const more = collect({ after: startedAt })
      if (!('error' in more)) out.push(...more.lines)
    }
    return { stdout: out.join('\n'), stderr: notes.join('\n'), exitCode: 0 }
  },
  complete: (ctx, words, partial) => {
    const nsIndex = words.findIndex((w) => w === '-n' || w === '--namespace')
    const namespace =
      nsIndex >= 0 ? (words[nsIndex + 1] ?? ctx.sim.namespace()) : ctx.sim.namespace()
    return ctx.sim
      .cluster()
      .list('Pod', { namespace })
      .map((p) => p.metadata.name)
      .filter((n) => n.startsWith(partial))
  },
})
