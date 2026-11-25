import { bool, str } from '../flags.ts'
import { humanDuration, tabwrite } from '../format.ts'
import { defineCommand, fail, ok } from '../types.ts'
import { target } from './globals.ts'

/** `kubectl events` (the newer command): oldest first, repeats shown as "(xN over …)" (E6-06). */
export const kubectlEvents = defineCommand({
  path: ['kubectl', 'events'],
  summary: 'List events, oldest first',
  usage: 'kubectl events [-n NS | -A] [--for TYPE/NAME] [--types Warning,Normal]',
  flags: [
    { name: 'for', type: 'string', description: 'Only events about this object, e.g. pod/web-1' },
    { name: 'types', type: 'string', description: 'Only these event types, e.g. Warning' },
    { name: 'no-headers', type: 'bool', description: "Don't print headers" },
  ],
  help: () =>
    'Display events.\n\nPrints a table of the most important information about events, oldest first.\n\nExamples:\n  # Recent events in a namespace\n  kubectl events -n ravenpost\n\n  # Only warnings, everywhere\n  kubectl events -A --types=Warning\n\n  # Events about one pod\n  kubectl events -n ravenpost --for pod/<name>\n\nUsage:\n  kubectl events [(-o|--output=)json|yaml|name] [--for TYPE/NAME] [--watch] [options]',
  run: (ctx, inv) => {
    const t = target(ctx, inv.flags)
    if (!t.ok) return fail(t.error)
    const { cluster, namespace, allNamespaces } = t.target
    let events = cluster.list('Event', allNamespaces ? {} : { namespace })
    const forText = str(inv.flags, 'for')
    if (forText !== undefined) {
      const [kind = '', name = ''] = forText.split('/')
      const k =
        {
          po: 'pod',
          pods: 'pod',
          deploy: 'deployment',
          deployments: 'deployment',
          svc: 'service',
          no: 'node',
        }[kind.toLowerCase()] ?? kind.toLowerCase()
      if (!name) return fail(`error: --for must be in resource/name form`)
      events = events.filter(
        (e) => e.involvedObject.kind.toLowerCase() === k && e.involvedObject.name === name,
      )
    }
    const typesText = str(inv.flags, 'types')
    if (typesText !== undefined) {
      const types = typesText.split(',').map((x) => x.trim())
      const bad = types.find((x) => x !== 'Normal' && x !== 'Warning')
      if (bad) return fail(`error: valid --types are Normal or Warning`)
      events = events.filter((e) => types.includes(e.type))
    }
    if (!events.length)
      return {
        stdout: '',
        stderr: allNamespaces ? 'No events found.' : `No events found in ${namespace} namespace.`,
        exitCode: 0,
      }
    events.sort((a, b) =>
      a.lastTimestamp < b.lastTimestamp ? -1 : a.lastTimestamp > b.lastTimestamp ? 1 : 0,
    )
    const clock = ctx.sim.clock
    const ago = (iso: string) => humanDuration(clock.now - (Date.parse(iso) - clock.epochMs))
    const rows = events.map((e) => {
      const seen =
        e.count > 1
          ? `${ago(e.lastTimestamp)} (x${String(e.count)} over ${ago(e.firstTimestamp)})`
          : ago(e.lastTimestamp)
      const row = [
        seen,
        e.type,
        e.reason,
        `${e.involvedObject.kind}/${e.involvedObject.name}`,
        e.message,
      ]
      return allNamespaces ? [e.metadata.namespace ?? 'default', ...row] : row
    })
    const header = ['LAST SEEN', 'TYPE', 'REASON', 'OBJECT', 'MESSAGE']
    return ok(
      tabwrite(
        bool(inv.flags, 'no-headers')
          ? rows
          : [allNamespaces ? ['NAMESPACE', ...header] : header, ...rows],
      ),
    )
  },
})
