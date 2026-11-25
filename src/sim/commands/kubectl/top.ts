import { cpuMillis, memoryBytes } from '../../controllers/quantity.ts'
import { nodeUsage, podUsage, containerUsage } from '../../telemetry/usage.ts'
import { bool, str } from '../flags.ts'
import { tabwrite } from '../format.ts'
import { parseSelector } from '../label-selector.ts'
import { defineCommand, fail, ok } from '../types.ts'
import { target } from './globals.ts'

const cpu = (m: number) => `${String(m)}m`
const mem = (b: number) => `${String(Math.round(b / 1024 ** 2))}Mi`
const pct = (used: number, total: number) =>
  `${String(total > 0 ? Math.round((used * 100) / total) : 0)}%`

/** `kubectl top pods|nodes`: what metrics-server reports, from the scenario's usage figures (E6-06). */
export const kubectlTop = defineCommand({
  path: ['kubectl', 'top'],
  summary: 'Show CPU and memory use of pods or nodes',
  usage:
    'kubectl top pod|node [NAME] [-n NS | -A] [-l SELECTOR] [--containers] [--sort-by cpu|memory]',
  flags: [
    { name: 'containers', type: 'bool', description: 'Show each container' },
    { name: 'sort-by', type: 'string', description: 'cpu or memory', values: ['cpu', 'memory'] },
    { name: 'no-headers', type: 'bool', description: "Don't print headers" },
  ],
  help: () =>
    'Display resource (CPU/memory) usage.\n\n The top command lets you see the resource consumption for nodes or pods.\n\nAvailable Commands:\n  node          Display resource (CPU/memory) usage of nodes\n  pod           Display resource (CPU/memory) usage of pods\n\nUsage:\n  kubectl top [flags] [options]',
  run: (ctx, inv) => {
    const [what, name] = inv.args
    const t = target(ctx, inv.flags)
    if (!t.ok) return fail(t.error)
    const { cluster, namespace, allNamespaces } = t.target
    const sim = ctx.sim
    const sortBy = str(inv.flags, 'sort-by')
    if (sortBy !== undefined && sortBy !== 'cpu' && sortBy !== 'memory')
      return fail(`error: --sort-by accepts only cpu or memory`)
    const selText = str(inv.flags, 'selector')
    const sel = selText !== undefined ? parseSelector(selText) : undefined
    if (sel && !sel.ok) return fail(sel.error)
    const headers = bool(inv.flags, 'no-headers') ? 'none' : 'show'
    if (what === 'pod' || what === 'pods' || what === 'po') {
      let pods = cluster
        .list('Pod', {
          ...(allNamespaces ? {} : { namespace }),
          ...(sel?.ok ? { selector: sel.selector } : {}),
        })
        .filter(
          (p) =>
            !p.metadata.deletionTimestamp &&
            // metrics-server has nothing for a pod with no running container.
            (p.status.containerStatuses ?? []).some((c) => c.state.running),
        )
      if (name) {
        pods = pods.filter((p) => p.metadata.name === name)
        if (!pods.length)
          return fail(
            `Error from server (NotFound): podmetrics.metrics.k8s.io "${namespace}/${name}" not found`,
          )
      }
      if (!pods.length)
        return { stdout: '', stderr: `No resources found in ${namespace} namespace.`, exitCode: 0 }
      const withUsage = pods.map((p) => ({ p, u: podUsage(sim, p) }))
      if (sortBy)
        withUsage.sort((a, b) => (sortBy === 'cpu' ? b.u.cpu - a.u.cpu : b.u.memory - a.u.memory))
      const ns = (p: (typeof pods)[number]) =>
        allNamespaces ? [p.metadata.namespace ?? 'default'] : []
      const rows = bool(inv.flags, 'containers')
        ? withUsage.flatMap(({ p }) =>
            p.spec.containers.map((c) => {
              const u = containerUsage(sim, p, c.name)
              return [...ns(p), p.metadata.name, c.name, cpu(u.cpu), mem(u.memory)]
            }),
          )
        : withUsage.map(({ p, u }) => [...ns(p), p.metadata.name, cpu(u.cpu), mem(u.memory)])
      const header = [
        ...(allNamespaces ? ['NAMESPACE'] : []),
        'NAME',
        ...(bool(inv.flags, 'containers') ? ['CONTAINER'] : []),
        'CPU(cores)',
        'MEMORY(bytes)',
      ]
      return ok(tabwrite(headers === 'none' ? rows : [header, ...rows]))
    }
    if (what === 'node' || what === 'nodes' || what === 'no') {
      let nodes = cluster.list('Node', sel?.ok ? { selector: sel.selector } : {})
      if (name) {
        nodes = nodes.filter((n) => n.metadata.name === name)
        if (!nodes.length)
          return fail(
            `Error from server (NotFound): nodemetrics.metrics.k8s.io "${name}" not found`,
          )
      }
      const pods = cluster.list('Pod').filter((p) => p.status.phase === 'Running')
      const withUsage = nodes.map((n) => ({ n, u: nodeUsage(sim, pods, n) }))
      if (sortBy)
        withUsage.sort((a, b) => (sortBy === 'cpu' ? b.u.cpu - a.u.cpu : b.u.memory - a.u.memory))
      const rows = withUsage.map(({ n, u }) => [
        n.metadata.name,
        cpu(u.cpu),
        pct(u.cpu, cpuMillis(n.status.allocatable.cpu)),
        mem(u.memory),
        pct(u.memory, memoryBytes(n.status.allocatable.memory)),
      ])
      const header = ['NAME', 'CPU(cores)', 'CPU(%)', 'MEMORY(bytes)', 'MEMORY(%)']
      return ok(tabwrite(headers === 'none' ? rows : [header, ...rows]))
    }
    return fail(
      `error: unknown command "${what ?? ''}" for "kubectl top"\n\nAvailable Commands:\n  node\n  pod`,
    )
  },
  complete: (_ctx, words, partial) =>
    words.filter((w) => !w.startsWith('-')).length === 0
      ? ['node', 'pod'].filter((x) => x.startsWith(partial))
      : [],
})
