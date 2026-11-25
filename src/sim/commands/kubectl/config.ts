import { str } from '../flags.ts'
import { tabwrite } from '../format.ts'
import { defineCommand, fail, ok } from '../types.ts'

const HELP = `Modify kubeconfig files using subcommands like "kubectl config set current-context my-context".

Available Commands in this simulator:
  current-context   Display the current-context
  get-contexts      Describe one or many contexts
  set-context       Set a context's default namespace (--current or NAME, with --namespace)
  use-context       Set the current-context in a kubeconfig file

Usage:
  kubectl config SUBCOMMAND [options]`

const SUBCOMMANDS = ['current-context', 'get-contexts', 'use-context', 'set-context'] as const

/** Whether a context points at production: the prompt marks it as a warning (E6-12). */
export function isProdContext(name: string, cluster: string): boolean {
  return (
    /(^|[-_.])prod(uction)?($|[-_.])/.test(name) || /(^|[-_.])prod(uction)?($|[-_.])/.test(cluster)
  )
}

/** `kubectl config …` for contexts (E6-12). Other kubeconfig subcommands explain themselves. */
export const kubectlConfig = defineCommand({
  path: ['kubectl', 'config'],
  summary: 'Show and switch contexts (which cluster you talk to)',
  usage:
    'kubectl config get-contexts | current-context | use-context NAME | set-context --current --namespace=NS',
  flags: [
    { name: 'current', type: 'bool', description: 'Modify the current context' },
    { name: 'no-headers', type: 'bool', description: "Don't print headers" },
  ],
  help: () => HELP,
  run: (ctx, inv) => {
    const [sub, ...args] = inv.args
    const sim = ctx.sim
    switch (sub) {
      case undefined:
        return ok(HELP)
      case 'current-context':
        return ok(sim.currentContext)
      case 'get-contexts': {
        const wanted = args[0]
        const contexts = sim.contexts.filter((c) => wanted === undefined || c.name === wanted)
        if (wanted !== undefined && contexts.length === 0)
          return fail(`error: context ${wanted} not found`)
        if (str(inv.flags, 'output') === 'name') return ok(contexts.map((c) => c.name).join('\n'))
        // NAMESPACE is blank for a context that doesn't set one, as in kubectl.
        const rows = contexts.map((c) => {
          const ns = sim.namespace(c.name)
          const shown = c.namespace !== undefined || ns !== 'default' ? ns : ''
          return [c.name === sim.currentContext ? '*' : '', c.name, c.cluster, c.user, shown]
        })
        const header = ['CURRENT', 'NAME', 'CLUSTER', 'AUTHINFO', 'NAMESPACE']
        return ok(tabwrite(inv.flags['no-headers'] === true ? rows : [header, ...rows]))
      }
      case 'use-context': {
        const name = args[0]
        if (!name)
          return fail(
            "error: Unexpected args: []\nSee 'kubectl config use-context -h' for help and examples",
          )
        if (!sim.contexts.some((c) => c.name === name))
          return fail(`error: no context exists with the name: "${name}"`)
        sim.useContext(name)
        return ok(`Switched to context "${name}".`)
      }
      case 'set-context': {
        const name = inv.flags.current === true ? sim.currentContext : args[0]
        if (!name) return fail('error: you must specify a non-empty context name or --current')
        if (!sim.contexts.some((c) => c.name === name))
          return fail(
            `Creating new contexts isn't supported in this simulator. Contexts here: ${sim.contexts.map((c) => c.name).join(', ')}.`,
          )
        const ns = str(inv.flags, 'namespace')
        if (ns === undefined) return ok(`Context "${name}" modified.`)
        sim.setNamespace(name, ns)
        return ok(`Context "${name}" modified.`)
      }
      default:
        return fail(
          `\`kubectl config ${sub}\` works on a real cluster, but this simulator only supports ${SUBCOMMANDS.join(', ')}. Try \`kubectl config get-contexts\`.`,
        )
    }
  },
  complete: (ctx, words, partial) => {
    const positional = words.filter((w) => !w.startsWith('-'))
    if (positional.length === 0) return SUBCOMMANDS.filter((s) => s.startsWith(partial))
    if (
      positional[0] === 'use-context' ||
      positional[0] === 'get-contexts' ||
      positional[0] === 'set-context'
    )
      return ctx.sim.contexts.map((c) => c.name).filter((n) => n.startsWith(partial))
    return []
  },
})

/** What the terminal prompt shows: where commands will act (E6-12). */
export interface PromptState {
  context: string
  cluster: string
  namespace: string
  prod: boolean
}

export function promptState(sim: {
  currentContext: string
  contexts: readonly { name: string; cluster: string }[]
  namespace: () => string
}): PromptState {
  const c = sim.contexts.find((x) => x.name === sim.currentContext)
  const cluster = c?.cluster ?? ''
  return {
    context: sim.currentContext,
    cluster,
    namespace: sim.namespace(),
    prod: isProdContext(sim.currentContext, cluster),
  }
}
