import { stringify as toYaml } from 'yaml'
import type { LabelSelector } from '../../core/resources.ts'
import { suggest } from '../distance.ts'
import { bool, str } from '../flags.ts'
import { tabwrite } from '../format.ts'
import { parseSelector } from '../label-selector.ts'
import {
  labelsText,
  PRINTERS,
  printerFor,
  type PrintContext,
  type Printer,
  type PrintableObject,
} from '../printers/index.ts'
import { allTypeNames, resolveType, RESOURCE_TYPES } from '../resource-types.ts'
import { defineCommand, fail, type Output } from '../types.ts'
import { target } from './globals.ts'

const HELP = `Display one or many resources.

 Prints a table of the most important information about the specified resources.

Examples:
  # List all pods in the current namespace
  kubectl get pods

  # List pods in the ravenpost namespace, with more detail (IP and node)
  kubectl get pods -n ravenpost -o wide

  # List deployments and services together
  kubectl get deploy,svc -n ravenpost

  # Recent events, oldest first
  kubectl get events -n ravenpost --sort-by=.lastTimestamp

  # One pod as YAML
  kubectl get pod <name> -n ravenpost -o yaml

Options:
  -A, --all-namespaces=false: List the requested object(s) across all namespaces.
  -l, --selector='': Selector (label query) to filter on, e.g. app=web or 'tier in (front,back)'.
  -o, --output='': Output format. One of: (json, yaml, name, wide).
      --show-labels=false: When printing, show all labels as the last column.
      --sort-by='': Sort list types using this field specification, e.g. .lastTimestamp.
  -w, --watch=false: After listing, watch for changes (stops after a minute of simulated time).
  -n, --namespace='': If present, the namespace scope for this request.
      --context='': The name of the kubeconfig context to use.

Usage:
  kubectl get [(-o|--output=)json|yaml|name|wide] (TYPE[,TYPE...] [NAME | -l label] | TYPE/NAME ...) [flags] [options]`

const FORMATS = ['wide', 'name', 'yaml', 'json'] as const
/** `kubectl get all` lists these, in this order. */
const ALL = ['pods', 'services', 'deployments', 'replicasets']
/** How long `-w` watches, in simulated time, and how often it looks. */
export const WATCH_MS = 60_000
const WATCH_STEP_MS = 1000

/** API group suffix kubectl uses in NotFound errors (`deployments.apps "x" not found`). */
const GROUP: Record<string, string> = { deployments: '.apps', replicasets: '.apps' }

/** Reads `.a.b[0].c` from an object, for --sort-by. */
function readPath(obj: unknown, path: string): unknown {
  const parts = path
    .replace(/^\{?\.?/, '')
    .replace(/\}$/, '')
    .split('.')
    .filter(Boolean)
  let v: unknown = obj
  for (const part of parts) {
    const m = /^([^[]+)(?:\[(\d+)\])?$/.exec(part)
    if (!m || typeof v !== 'object' || v === null) return undefined
    v = (v as Record<string, unknown>)[m[1] ?? '']
    if (m[2] !== undefined) v = Array.isArray(v) ? (v as unknown[])[Number(m[2])] : undefined
  }
  return v
}

function sortBy<T>(items: T[], path: string): T[] {
  return [...items].sort((a, b) => {
    const x = readPath(a, path)
    const y = readPath(b, path)
    if (x === y) return 0
    if (x === undefined) return -1
    if (y === undefined) return 1
    if (typeof x === 'number' && typeof y === 'number') return x - y
    const sx = typeof x === 'string' ? x : JSON.stringify(x)
    const sy = typeof y === 'string' ? y : JSON.stringify(y)
    return sx < sy ? -1 : 1
  })
}

/** kubectl's -o yaml: keys sorted, sequences not indented, timestamps and numeric strings quoted. */
export function kubectlYaml(value: unknown): string {
  return toYaml(value, {
    sortMapEntries: true,
    indentSeq: false,
    lineWidth: 0,
    schema: 'yaml-1.1',
    version: '1.1',
    // kubectl never writes anchors, even where two fields share a value.
    aliasDuplicateObjects: false,
  }).trimEnd()
}

const apiOf = (p: Printer, obj: PrintableObject, ctx: PrintContext) =>
  p.toApi ? p.toApi(obj, ctx) : obj

interface Section {
  printer: Printer
  items: PrintableObject[]
  /** Prefix names with `type/` (several types in one command). */
  prefixed: boolean
}

function table(
  sections: Section[],
  ctx: PrintContext,
  opts: { wide: boolean; labels: boolean; allNamespaces: boolean },
): string {
  return sections
    .filter((s) => s.items.length)
    .map(({ printer, items, prefixed }) => {
      const withNs = opts.allNamespaces && printer.namespaced
      const header = [
        ...printer.columns,
        ...(opts.wide ? (printer.wideColumns ?? []) : []),
        ...(opts.labels ? ['LABELS'] : []),
      ]
      const rows = items.map((o) => {
        const row = [
          ...printer.row(o, ctx),
          ...(opts.wide && printer.wideRow ? printer.wideRow(o, ctx) : []),
        ]
        if (prefixed && printer.columns[0] === 'NAME')
          row[0] = `${printer.nameGroup}/${row[0] ?? ''}`
        if (opts.labels) row.push(labelsText(o.metadata.labels))
        return withNs ? [o.metadata.namespace ?? 'default', ...row] : row
      })
      return tabwrite([withNs ? ['NAMESPACE', ...header] : header, ...rows])
    })
    .join('\n\n')
}

/** `kubectl get` for every type in the printer registry (E6-05). */
export const kubectlGet = defineCommand({
  path: ['kubectl', 'get'],
  summary: 'List resources',
  usage: 'kubectl get TYPE[,TYPE] [NAME] [-n NS | -A] [-l SELECTOR] [-o wide|name|yaml|json] [-w]',
  flags: [
    { name: 'show-labels', type: 'bool', description: 'Show labels as the last column' },
    { name: 'watch', short: 'w', type: 'bool', description: 'Watch for changes' },
    { name: 'sort-by', type: 'string', description: 'Sort by a field, e.g. .lastTimestamp' },
    { name: 'no-headers', type: 'bool', description: "Don't print headers" },
  ],
  help: () => HELP,
  run: (ctx, inv): Output => {
    const [typeArg, ...rest] = inv.args
    if (!typeArg)
      return fail(
        'You must specify the type of resource to get. Use "kubectl api-resources" for a complete list of supported resources.\n\nerror: Required resource not specified.\nUse "kubectl explain <resource>" for a detailed description of that resource (e.g. kubectl explain pods).\nSee \'kubectl get -h\' for help and examples',
      )
    const output = str(inv.flags, 'output')
    if (output !== undefined && !(FORMATS as readonly string[]).includes(output))
      return fail(
        `error: unable to match a printer suitable for the output format "${output}", allowed formats are: custom-columns,custom-columns-file,go-template,go-template-file,json,jsonpath,jsonpath-as-json,jsonpath-file,name,template,templatefile,wide,yaml`,
      )

    // TYPE[,TYPE] NAME… or TYPE/NAME …
    const wanted: { type: string; name?: string }[] = []
    const args = [typeArg, ...rest]
    if (typeArg.includes('/')) {
      for (const a of args) {
        const [t = '', n] = a.split('/')
        if (!n)
          return fail(
            `error: there is no need to specify a resource type as a separate argument when passing arguments in resource/name form (e.g. 'kubectl get resource/<resource_name>' instead of 'kubectl get resource resource/<resource_name>'`,
          )
        wanted.push({ type: t, name: n })
      }
    } else {
      const types = typeArg.split(',').flatMap((t) => (t === 'all' ? ALL : [t]))
      for (const t of types) {
        if (rest.length) for (const n of rest) wanted.push({ type: t, name: n })
        else wanted.push({ type: t })
      }
    }
    const printers: Printer[] = []
    for (const w of wanted) {
      const type = resolveType(w.type)
      if (!type) {
        const close = suggest(w.type, allTypeNames())
        return fail(
          `error: the server doesn't have a resource type "${w.type}"${close.length ? `\n\nDid you mean \`${close[0] ?? ''}\`?` : ''}`,
        )
      }
      const p = printerFor(type.plural)
      if (!p)
        return fail(
          `\`kubectl get ${type.plural}\` works on a real cluster, but this simulator doesn't have any ${type.plural}. It lists: ${PRINTERS.map((x) => x.type).join(', ')}.`,
        )
      w.type = p.type
      if (!printers.includes(p)) printers.push(p)
    }

    const t = target(ctx, inv.flags)
    if (!t.ok) return fail(t.error)
    const { cluster, namespace, allNamespaces } = t.target
    const named = wanted.some((w) => w.name)
    if (named && allNamespaces)
      return fail('error: a resource cannot be retrieved by name across all namespaces')
    const selText = str(inv.flags, 'selector')
    let selector: LabelSelector | undefined
    if (selText !== undefined) {
      const sel = parseSelector(selText)
      if (!sel.ok) return fail(sel.error)
      selector = sel.selector
    }
    const pctx: PrintContext = { cluster, clock: ctx.sim.clock }
    const errors: string[] = []
    const warnings = new Set<string>()
    const collect = (): Section[] =>
      printers.map((p) => {
        if (p.warning) warnings.add(p.warning)
        const ns = p.namespaced && !allNamespaces ? namespace : undefined
        let items = p.list(pctx, ns, selector)
        const names = wanted.filter((w) => w.type === p.type && w.name).map((w) => w.name as string)
        if (names.length) {
          const found: PrintableObject[] = []
          for (const n of names) {
            const o = items.find((i) => i.metadata.name === n)
            if (o) found.push(o)
            else
              errors.push(
                `Error from server (NotFound): ${p.type}${GROUP[p.type] ?? ''} "${n}" not found`,
              )
          }
          items = found
        }
        const sort = str(inv.flags, 'sort-by')
        if (sort) items = sortBy(items, sort)
        return { printer: p, items, prefixed: printers.length > 1 }
      })
    const sections = collect()
    const total = sections.reduce((n, s) => n + s.items.length, 0)

    let stdout: string
    if (output === 'name')
      stdout = sections
        .flatMap((s) => s.items.map((o) => `${s.printer.nameGroup}/${o.metadata.name}`))
        .join('\n')
    else if (output === 'yaml' || output === 'json') {
      const objs = sections.flatMap((s) => s.items.map((o) => apiOf(s.printer, o, pctx)))
      const value =
        objs.length === 1 && named
          ? objs[0]
          : { apiVersion: 'v1', items: objs, kind: 'List', metadata: { resourceVersion: '' } }
      stdout =
        objs.length === 0 && named
          ? ''
          : output === 'yaml'
            ? kubectlYaml(value)
            : JSON.stringify(value, null, 4)
    } else {
      const opts = {
        wide: output === 'wide',
        labels: bool(inv.flags, 'show-labels'),
        allNamespaces,
      }
      stdout = table(sections, pctx, opts)
      if (inv.flags['no-headers'] === true)
        stdout = stdout
          .split('\n')
          .filter((_l, i, all) => i > 0 && all[i - 1] !== '')
          .join('\n')
      if (bool(inv.flags, 'watch') && !output?.match(/yaml|json|name/))
        stdout = watch(ctx.sim, stdout, collect, pctx, opts)
    }
    if (total === 0 && !named && !bool(inv.flags, 'watch'))
      errors.push(
        allNamespaces || printers.every((p) => !p.namespaced)
          ? 'No resources found'
          : `No resources found in ${namespace} namespace.`,
      )
    return {
      stdout,
      stderr: [...warnings, ...errors].join('\n'),
      exitCode: errors.some((e) => e.startsWith('Error from server')) ? 1 : 0,
    }
  },
  complete: (ctx, words, partial) => {
    const positional = words.filter((w) => !w.startsWith('-'))
    if (positional.length === 0)
      return RESOURCE_TYPES.map((r) => r.plural).filter((n) => n.startsWith(partial))
    const printer = printerFor(resolveType(positional[0] ?? '')?.plural ?? '')
    if (!printer) return []
    const nsIndex = words.findIndex((w) => w === '-n' || w === '--namespace')
    const namespace =
      nsIndex >= 0 ? (words[nsIndex + 1] ?? ctx.sim.namespace()) : ctx.sim.namespace()
    return printer
      .list(
        { cluster: ctx.sim.cluster(), clock: ctx.sim.clock },
        printer.namespaced ? namespace : undefined,
      )
      .map((o) => o.metadata.name)
      .filter((n) => n.startsWith(partial))
  },
})

/**
 * `-w`: lets simulated time run for a minute, printing a row whenever it changes (no header), the way
 * a real watch streams updates. The terminal (E6-09) can stop it early with Ctrl+C.
 */
function watch(
  sim: { advance: (ms: number) => void },
  first: string,
  collect: () => Section[],
  ctx: PrintContext,
  opts: { wide: boolean; labels: boolean; allNamespaces: boolean },
): string {
  const render = () => table(collect(), ctx, opts).split('\n').slice(1)
  const seen = new Set(
    first
      .split('\n')
      .slice(1)
      .map((l) => l.replace(/\s+\S+$/, '')),
  )
  const out = [first]
  for (let t = 0; t < WATCH_MS; t += WATCH_STEP_MS) {
    sim.advance(WATCH_STEP_MS)
    for (const line of render()) {
      // Compare without the AGE column, which changes every second.
      const key = line.replace(/\s+\S+$/, '')
      if (!seen.has(key)) {
        seen.add(key)
        out.push(line)
      }
    }
  }
  return out.join('\n')
}
