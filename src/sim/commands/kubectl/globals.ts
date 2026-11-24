import type { Cluster } from '../../core/cluster.ts'
import { str, bool, type FlagSpec, type FlagValues } from '../flags.ts'
import type { CommandContext } from '../types.ts'

export const OUTPUT_FORMATS = ['wide', 'name', 'yaml', 'json'] as const

/** Flags every kubectl command accepts. */
export const GLOBAL_FLAGS: readonly FlagSpec[] = [
  { name: 'namespace', short: 'n', type: 'string', description: 'The namespace to look in' },
  { name: 'all-namespaces', short: 'A', type: 'bool', description: 'Look in every namespace' },
  { name: 'context', type: 'string', description: 'The kubeconfig context to use' },
  {
    name: 'output',
    short: 'o',
    type: 'string',
    description: 'Output format: wide or name',
    values: OUTPUT_FORMATS,
  },
  { name: 'selector', short: 'l', type: 'string', description: 'Label selector, e.g. app=web' },
  { name: 'help', short: 'h', type: 'bool', description: 'Show help for the command' },
]

export interface Target {
  cluster: Cluster
  context: string
  namespace: string
  allNamespaces: boolean
}

/** Where a kubectl command acts: the `--context` (or current) cluster and the `-n` (or context) namespace. */
export function target(
  ctx: CommandContext,
  flags: FlagValues,
): { ok: true; target: Target } | { ok: false; error: string } {
  const context = str(flags, 'context') ?? ctx.sim.currentContext
  if (!ctx.sim.contexts.some((c) => c.name === context))
    return { ok: false, error: `error: context "${context}" does not exist` }
  return {
    ok: true,
    target: {
      cluster: ctx.sim.cluster(context),
      context,
      namespace: str(flags, 'namespace') ?? ctx.sim.namespace(context),
      allNamespaces: bool(flags, 'all-namespaces'),
    },
  }
}
