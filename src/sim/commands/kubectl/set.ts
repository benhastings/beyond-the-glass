import { defineCommand, fail, ok } from '../types.ts'
import { target } from './globals.ts'
import { mutated, notFound, parseRefs, slashName } from './objects.ts'

const HELP = `Update existing container image(s) of resources.

Examples:
  # Roll out a new image to the api container
  kubectl set image deployment/ravenpost-api api=registry.example/ravenpost/api:1.15.0 -n ravenpost

  # Every container in the template
  kubectl set image deployment/ravenpost-api *=registry.example/ravenpost/api:1.15.0 -n ravenpost

Usage:
  kubectl set image (-f FILENAME | TYPE NAME) CONTAINER_NAME_1=CONTAINER_IMAGE_1 ... CONTAINER_NAME_N=CONTAINER_IMAGE_N [options]`

const isPair = (w: string) => /^[^=/]+=.+$/.test(w)

/** `kubectl set image` for Deployments (E6-07); other `set` subcommands explain themselves. */
export const kubectlSet = defineCommand({
  path: ['kubectl', 'set'],
  summary: 'Change a Deployment’s container image (set image)',
  usage: 'kubectl set image deployment/NAME CONTAINER=IMAGE [-n NS]',
  flags: [],
  help: () => HELP,
  run: (ctx, inv) => {
    const [sub, ...rest] = inv.args
    if (sub !== 'image')
      return fail(
        sub
          ? `\`kubectl set ${sub}\` works on a real cluster, but this simulator supports \`kubectl set image\` only.`
          : `${HELP}\n\nerror: specify a subcommand: image`,
      )
    const t = target(ctx, inv.flags)
    if (!t.ok) return fail(t.error)
    const parsed = parseRefs(rest, isPair)
    if ('error' in parsed) return fail(parsed.error)
    const pairs = parsed.rest.filter(isPair)
    if (!parsed.refs.length || !pairs.length)
      return fail(
        "error: at least one image update is required\nSee 'kubectl set image -h' for help and examples",
      )
    const out: string[] = []
    for (const ref of parsed.refs) {
      if (ref.type.kind !== 'Deployment')
        return fail(
          `\`kubectl set image ${ref.type.plural}\` works on a real cluster; this simulator sets images on deployments.`,
        )
      const d = t.target.cluster.get('Deployment', t.target.namespace, ref.name)
      if (!d) return fail(notFound(ref.type, ref.name))
      const containers = d.spec.template.spec.containers
      const changes: { container: string; from: string; image: string }[] = []
      for (const pair of pairs) {
        const eq = pair.indexOf('=')
        const name = pair.slice(0, eq)
        const image = pair.slice(eq + 1)
        const matches = name === '*' ? containers : containers.filter((c) => c.name === name)
        if (!matches.length) return fail(`error: unable to find container named "${name}"`)
        for (const c of matches) {
          if (c.image !== image) changes.push({ container: c.name, from: c.image, image })
          c.image = image
        }
      }
      if (changes.length) {
        d.metadata.generation = (d.metadata.generation ?? 1) + 1
        t.target.cluster.put(d)
        mutated(ctx, inv, t.target, {
          verb: 'set-image',
          kind: 'Deployment',
          name: ref.name,
          detail: { changes },
        })
        out.push(`${slashName(ref.type, ref.name)} image updated`)
      }
    }
    return ok(out.join('\n'))
  },
})
