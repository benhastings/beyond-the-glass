import { fnv1a32 } from '../../core/rng.ts'
import type { Kind } from '../../core/resources.ts'
import { MANIFEST_API_VERSIONS } from '../../core/scenario.ts'
import { printerFor } from '../printers/index.ts'
import { defineCommand, fail, ok, type EditStep, type Output } from '../types.ts'
import { kubectlYaml } from './get.ts'
import { target } from './globals.ts'
import { applyObject, parseManifests } from './manifests.ts'
import { mutated, notFound, parseRefs, slashName } from './objects.ts'

export const EDIT_HEADER = `# Please edit the object below. Lines beginning with a '#' will be ignored,
# and an empty file will abort the edit. If an error occurs while saving this file will be
# reopened with the relevant failures.
#
`
const CANCELLED = 'Edit cancelled, no changes made.'

/** Comment lines become blank, so line numbers in errors match what the learner sees in the editor. */
const uncommented = (text: string) =>
  text
    .split('\n')
    .map((l) => (l.trimStart().startsWith('#') ? '' : l))
    .join('\n')
/** The text without its comment lines (and blank lines at either end), and where each saved line went. */
function body(text: string): { content: string; lineOf: (savedLine: number) => number } {
  const kept: { line: string; from: number }[] = []
  text.split('\n').forEach((line, n) => {
    if (!line.trimStart().startsWith('#')) kept.push({ line, from: n + 1 })
  })
  while (kept[0]?.line.trim() === '') kept.shift()
  while (kept.at(-1)?.line.trim() === '') kept.pop()
  return {
    content: kept.map((k) => k.line).join('\n'),
    lineOf: (saved) => {
      const at = kept.findIndex((k) => k.from >= saved)
      return (at < 0 ? kept.length - 1 : at) + 1
    },
  }
}
const commented = (msg: string) =>
  msg
    .split('\n')
    .map((l) => `# ${l}`)
    .join('\n')

/** `kubectl edit TYPE NAME` (E6-08): opens the object in the terminal's editor. */
export const kubectlEdit = defineCommand({
  path: ['kubectl', 'edit'],
  summary: 'Edit an object in the cluster as YAML',
  usage: 'kubectl edit (TYPE NAME | TYPE/NAME) [-n NS]',
  flags: [],
  help: () =>
    "Edit a resource from the default editor.\n\n Opens the object's YAML in an editor in this terminal. Save applies your changes; if they're not\n valid the editor opens again with the reason at the top. Cancel (Escape) changes nothing.\n\nExamples:\n  kubectl edit deployment/ravenpost-notifier -n ravenpost\n  kubectl edit configmap ravenpost-config -n ravenpost\n\nUsage:\n  kubectl edit (RESOURCE/NAME | -f FILENAME) [options]",
  run: (ctx, inv): Output => {
    const t = target(ctx, inv.flags)
    if (!t.ok) return fail(t.error)
    const parsed = parseRefs(inv.args)
    if ('error' in parsed) return fail(parsed.error)
    const ref = parsed.refs[0]
    if (!ref) return fail('error: you must provide one or more resources by argument or filename')
    if (!ref.name || parsed.refs.length > 1)
      return fail(
        `This simulator edits one object at a time: \`kubectl edit ${ref.type.singular} NAME\`. To see them all, try \`kubectl get ${ref.type.plural}\`.`,
      )
    if (!MANIFEST_API_VERSIONS[ref.type.kind])
      return fail(
        `\`kubectl edit ${ref.type.plural}\` works on a real cluster, but this simulator edits deployments, services, configmaps, secrets and namespaces. Pods belong to their Deployment: edit that instead.`,
      )
    const { cluster, namespace } = t.target
    const ns = ref.type.namespaced ? namespace : undefined
    const obj = cluster.get(ref.type.kind as Kind, ns, ref.name)
    if (!obj) return fail(notFound(ref.type, ref.name))
    const pctx = { cluster, clock: ctx.sim.clock }
    const api = printerFor(ref.type.plural)?.toApi?.(obj, pctx) ?? obj
    const original = `${kubectlYaml(api)}\n`
    const title = slashName(ref.type, ref.name)
    const fileName = `/tmp/kubectl-edit-${String(fnv1a32(`${title}/${String(ctx.sim.now)}`) % 10_000_000_000).padStart(10, '0')}.yaml`
    const save = (text: string): EditStep => {
      try {
        const { content, lineOf } = body(text)
        if (!content || content === original.trim())
          return { done: { stdout: '', stderr: CANCELLED, exitCode: 0 } }
        const reopen = (header: string, error: string): EditStep => ({
          reopen: `${EDIT_HEADER}${commented(header)}\n#\n${content}\n`,
          error,
        })
        const p = parseManifests(uncommented(text))
        if (!p.ok) {
          // Number the line as it appears in the reopened editor, so the message and the editor agree.
          const line = EDIT_HEADER.split('\n').length + 1 + lineOf(p.line)
          const error = p.error.replace(/line \d+:/, `line ${String(line)}:`)
          return { ...reopen(`The edited file had a syntax error: ${error}`, error), line }
        }
        const [doc] = p.docs
        const d = (doc ?? {}) as {
          apiVersion?: unknown
          kind?: unknown
          metadata?: { name?: unknown }
        }
        if (
          p.docs.length !== 1 ||
          d.apiVersion !== obj.apiVersion ||
          d.kind !== obj.kind ||
          d.metadata?.name !== ref.name
        )
          return reopen(
            'error: At least one of apiVersion, kind and name was changed',
            'At least one of apiVersion, kind and name was changed',
          )
        const r = applyObject(ctx.sim, cluster, doc, {
          source: fileName,
          namespace,
          namespaceFlag: true,
          dryRun: false,
          verb: 'edit',
        })
        if (!r.ok)
          return reopen(
            `${ref.type.plural}${title.includes('.apps/') ? '.apps' : ''} "${ref.name}" was not valid:\n* ${r.error}`,
            r.error,
          )
        if (r.action === 'unchanged')
          return { done: { stdout: '', stderr: CANCELLED, exitCode: 0 } }
        mutated(ctx, inv, t.target, {
          verb: 'edit',
          kind: r.kind,
          name: r.name,
          namespaced: ref.type.namespaced,
        })
        return { done: ok(`${title} edited`) }
      } catch (e) {
        return {
          done: fail(
            `Something went wrong inside the simulator while saving, so nothing changed. (${e instanceof Error ? e.message : String(e)})`,
          ),
        }
      }
    }
    return {
      stdout: '',
      stderr: '',
      exitCode: 0,
      edit: {
        title,
        fileName,
        text: `${EDIT_HEADER}${original}`,
        save,
        cancel: () => ({ stdout: '', stderr: CANCELLED, exitCode: 0 }),
      },
    }
  },
})
