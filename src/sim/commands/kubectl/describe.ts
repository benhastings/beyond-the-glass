import type { Resource } from '../../core/resources.ts'
import { describe, DESCRIBERS } from '../describers/index.ts'
import { suggest } from '../distance.ts'
import { str } from '../flags.ts'
import { parseSelector } from '../label-selector.ts'
import { allTypeNames, resolveType } from '../resource-types.ts'
import { defineCommand, fail, ok } from '../types.ts'
import { target } from './globals.ts'

const HELP = `Show details of a specific resource or group of resources.

 Print a detailed description of the selected resources, including related resources such as events.
 Names are matched by prefix, like kubectl: "kubectl describe pods web" describes every pod whose name
 starts with "web".

Examples:
  # Describe a pod, with its container states and events
  kubectl describe pod <name> -n ravenpost

  # Describe every pod with a label
  kubectl describe pods -l app=ravenpost-api -n ravenpost

  # Describe a deployment, a service or a node
  kubectl describe deployment ravenpost-api -n ravenpost
  kubectl describe svc ravenpost-web -n ravenpost
  kubectl describe node ravenpost-worker

Usage:
  kubectl describe (-f FILENAME | TYPE [NAME_PREFIX | -l label] | TYPE/NAME) [options]`

/** `kubectl describe` for pods, deployments, services and nodes (E6-05). */
export const kubectlDescribe = defineCommand({
  path: ['kubectl', 'describe'],
  summary: 'Show details and events for pods, deployments, services and nodes',
  usage: 'kubectl describe TYPE [NAME_PREFIX] [-n NS] [-l SELECTOR]',
  flags: [],
  help: () => HELP,
  run: (ctx, inv) => {
    const [first, ...rest] = inv.args
    if (!first)
      return fail(
        'You must specify the type of resource to describe. Use "kubectl api-resources" for a complete list of supported resources.',
      )
    const [typeName = '', slashName] = first.split('/')
    const type = resolveType(typeName)
    if (!type) {
      const close = suggest(typeName, allTypeNames())
      return fail(
        `error: the server doesn't have a resource type "${typeName}"${close.length ? `\n\nDid you mean \`${close[0] ?? ''}\`?` : ''}`,
      )
    }
    const d = DESCRIBERS.find((x) => x.type === type.plural)
    if (!d)
      return fail(
        `\`kubectl describe ${type.plural}\` works on a real cluster, but this simulator describes ${DESCRIBERS.map((x) => x.type).join(', ')}. Try \`kubectl get ${type.plural} -o yaml\`.`,
      )
    const t = target(ctx, inv.flags)
    if (!t.ok) return fail(t.error)
    const { cluster, namespace, allNamespaces } = t.target
    const selText = str(inv.flags, 'selector')
    const sel = selText !== undefined ? parseSelector(selText) : undefined
    if (sel && !sel.ok) return fail(sel.error)
    const all = cluster.list(d.kind, {
      ...(type.namespaced && !allNamespaces ? { namespace } : {}),
      ...(sel?.ok ? { selector: sel.selector } : {}),
    }) as Resource[]
    const names = [...(slashName ? [slashName] : []), ...rest]
    let chosen: Resource[] = all
    const errors: string[] = []
    if (names.length) {
      chosen = []
      for (const n of names) {
        const exact = all.find((o) => o.metadata.name === n)
        const matches = exact ? [exact] : all.filter((o) => o.metadata.name.startsWith(n))
        if (!matches.length)
          errors.push(
            `Error from server (NotFound): ${type.plural}${type.plural.match(/^(deployments|replicasets)$/) ? '.apps' : ''} "${n}" not found`,
          )
        chosen.push(...matches)
      }
    }
    if (!chosen.length && !errors.length)
      return {
        stdout: '',
        stderr:
          type.namespaced && !allNamespaces
            ? `No resources found in ${namespace} namespace.`
            : 'No resources found',
        exitCode: 0,
      }
    const pctx = { cluster, clock: ctx.sim.clock }
    const stdout = chosen.map((o) => describe(d, o, pctx)).join('\n\n\n')
    return errors.length ? { stdout, stderr: errors.join('\n'), exitCode: 1 } : ok(stdout)
  },
  complete: (ctx, words, partial) => {
    const positional = words.filter((w) => !w.startsWith('-'))
    if (positional.length === 0)
      return DESCRIBERS.map((d) => d.type).filter((n) => n.startsWith(partial))
    const d = DESCRIBERS.find((x) => x.type === resolveType(positional[0] ?? '')?.plural)
    if (!d) return []
    const nsIndex = words.findIndex((w) => w === '-n' || w === '--namespace')
    const namespace =
      nsIndex >= 0 ? (words[nsIndex + 1] ?? ctx.sim.namespace()) : ctx.sim.namespace()
    return (ctx.sim.cluster().list(d.kind, d.kind === 'Node' ? {} : { namespace }) as Resource[])
      .map((o) => o.metadata.name)
      .filter((n) => n.startsWith(partial))
  },
})
