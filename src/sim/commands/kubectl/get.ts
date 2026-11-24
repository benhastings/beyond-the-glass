import type { Pod } from '../../core/resources.ts'
import { suggest } from '../distance.ts'
import { bool, str } from '../flags.ts'
import { tabwrite } from '../format.ts'
import { parseSelector } from '../label-selector.ts'
import { age, podColumns } from '../pod-columns.ts'
import { allTypeNames, resolveType, RESOURCE_TYPES } from '../resource-types.ts'
import { defineCommand, fail } from '../types.ts'
import { target } from './globals.ts'

const HELP = `Display one or many resources.

 Prints a table of the most important information about the specified resources.

Examples:
  # List all pods in the current namespace
  kubectl get pods

  # List pods in the ravenpost namespace
  kubectl get pods -n ravenpost

  # List pods in every namespace
  kubectl get pods -A

  # List pods with more detail (IP and node)
  kubectl get pods -o wide

  # List pods with a label
  kubectl get pods -l app=ravenpost-web

Options:
  -A, --all-namespaces=false: List the requested object(s) across all namespaces.
  -l, --selector='': Selector (label query) to filter on.
  -o, --output='': Output format. One of: (name, wide).
      --show-labels=false: When printing, show all labels as the last column.
  -n, --namespace='': If present, the namespace scope for this request.
      --context='': The name of the kubeconfig context to use.

Usage:
  kubectl get [(-o|--output=)name|wide] (TYPE[.VERSION][.GROUP] [NAME | -l label] | TYPE[.VERSION][.GROUP]/NAME ...) [flags] [options]`

function podRow(
  p: Pod,
  wide: boolean,
  withNamespace: boolean,
  showLabels: boolean,
  clock: Parameters<typeof podColumns>[1],
): string[] {
  const c = podColumns(p, clock)
  const row = [
    p.metadata.name,
    c.ready,
    c.status,
    c.restarts,
    age(p.metadata.creationTimestamp, clock),
  ]
  if (wide) row.push(p.status.podIP ?? '<none>', p.spec.nodeName ?? '<none>', '<none>', '<none>')
  if (showLabels)
    row.push(
      Object.entries(p.metadata.labels ?? {})
        .map(([k, v]) => `${k}=${v}`)
        .join(',') || '<none>',
    )
  return withNamespace ? [p.metadata.namespace ?? 'default', ...row] : row
}

/** `kubectl get` (E6-04 ships pods; E6-05 adds the other types and formats). */
export const kubectlGet = defineCommand({
  path: ['kubectl', 'get'],
  summary: 'List resources (pods so far)',
  usage: 'kubectl get pods [NAME] [-n NAMESPACE | -A] [-l SELECTOR] [-o wide|name]',
  flags: [
    { name: 'show-labels', type: 'bool', description: 'Show labels as the last column' },
    { name: 'watch', short: 'w', type: 'bool', description: 'Watch for changes' },
  ],
  help: () => HELP,
  run: (ctx, inv) => {
    const [typeArg, ...names] = inv.args
    if (!typeArg)
      return fail(
        'You must specify the type of resource to get. Use "kubectl api-resources" for a complete list of supported resources.\n\nerror: Required resource not specified.\nUse "kubectl explain <resource>" for a detailed description of that resource (e.g. kubectl explain pods).\nSee \'kubectl get -h\' for help and examples',
      )
    const [typeName = '', slashName] = typeArg.split('/')
    const type = resolveType(typeName)
    if (!type) {
      const close = suggest(typeName, allTypeNames())
      return fail(
        `error: the server doesn't have a resource type "${typeName}"${close.length ? `\n\nDid you mean \`${close[0] ?? ''}\`?` : ''}`,
      )
    }
    if (type.plural !== 'pods')
      return fail(
        `\`kubectl get ${type.plural}\` works on a real cluster, but this simulator only lists pods so far. Try \`kubectl get pods\`.`,
      )
    const output = str(inv.flags, 'output')
    if (output !== undefined && !['wide', 'name', 'yaml', 'json'].includes(output))
      return fail(
        `error: unable to match a printer suitable for the output format "${output}", allowed formats are: custom-columns,custom-columns-file,go-template,go-template-file,json,jsonpath,jsonpath-as-json,jsonpath-file,name,template,templatefile,wide,yaml`,
      )
    if (output === 'yaml' || output === 'json')
      return fail(
        `\`-o ${output}\` works on a real cluster, but this simulator doesn't print ${output.toUpperCase()} yet. Try \`-o wide\`.`,
      )
    if (bool(inv.flags, 'watch'))
      return fail(
        '`--watch` works on a real cluster, but this simulator doesn’t stream updates yet. Run the command again to see changes.',
      )

    const t = target(ctx, inv.flags)
    if (!t.ok) return fail(t.error)
    const { cluster, namespace, allNamespaces } = t.target
    const selectorText = str(inv.flags, 'selector')
    const sel = selectorText !== undefined ? parseSelector(selectorText) : undefined
    if (sel && !sel.ok) return fail(sel.error)
    const wanted = [...(slashName ? [slashName] : []), ...names]
    if (wanted.length && allNamespaces)
      return fail('error: a resource cannot be retrieved by name across all namespaces')

    let pods = cluster.list('Pod', {
      ...(allNamespaces ? {} : { namespace }),
      ...(sel?.ok ? { selector: sel.selector } : {}),
    })
    const errors: string[] = []
    if (wanted.length) {
      const found: Pod[] = []
      for (const n of wanted) {
        const p = pods.find((x) => x.metadata.name === n)
        if (p) found.push(p)
        else errors.push(`Error from server (NotFound): pods "${n}" not found`)
      }
      pods = found
    }
    const clock = ctx.sim.clock
    let stdout: string
    if (output === 'name') stdout = pods.map((p) => `pod/${p.metadata.name}`).join('\n')
    else if (pods.length === 0) stdout = ''
    else {
      const wide = output === 'wide'
      const showLabels = bool(inv.flags, 'show-labels')
      const header = ['NAME', 'READY', 'STATUS', 'RESTARTS', 'AGE']
      if (wide) header.push('IP', 'NODE', 'NOMINATED NODE', 'READINESS GATES')
      if (showLabels) header.push('LABELS')
      stdout = tabwrite([
        allNamespaces ? ['NAMESPACE', ...header] : header,
        ...pods.map((p) => podRow(p, wide, allNamespaces, showLabels, clock)),
      ])
    }
    if (pods.length === 0 && !wanted.length)
      errors.push(
        allNamespaces ? 'No resources found' : `No resources found in ${namespace} namespace.`,
      )
    return { stdout, stderr: errors.join('\n'), exitCode: errors.length && wanted.length ? 1 : 0 }
  },
  complete: (ctx, words, partial) => {
    // words: what follows `kubectl get`, flags included.
    const positional = words.filter((w) => !w.startsWith('-'))
    if (positional.length === 0)
      return RESOURCE_TYPES.map((r) => r.plural).filter((n) => n.startsWith(partial))
    if (resolveType(positional[0] ?? '')?.plural !== 'pods') return []
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
