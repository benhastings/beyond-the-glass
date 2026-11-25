import { bool, str } from '../flags.ts'
import { resolveType } from '../resource-types.ts'
import { defineCommand, fail, type Output } from '../types.ts'
import { manifestFiles } from './file-args.ts'
import { target } from './globals.ts'
import { applyObject, parseManifests } from './manifests.ts'
import { mutated, nameGroup } from './objects.ts'

const DRY_RUN = ['none', 'client', 'server'] as const

/** `kubectl apply -f FILE|DIR` (E6-08): the files in the learner's home folder. */
export const kubectlApply = defineCommand({
  path: ['kubectl', 'apply'],
  summary: 'Create or update objects from manifest files',
  usage: 'kubectl apply -f FILE|DIR [-R] [--dry-run=client|server] [-n NS]',
  flags: [
    { name: 'filename', short: 'f', type: 'string', description: 'Manifest file or folder' },
    { name: 'recursive', short: 'R', type: 'bool', description: 'Include subfolders of a folder' },
    {
      name: 'dry-run',
      type: 'string',
      description: 'Check without changing anything',
      values: DRY_RUN,
    },
  ],
  help: () =>
    "Apply a configuration to a resource by file name.\n\n The resource is created if it doesn't exist yet. Files are in your home folder: `ls` lists them\n and `kubectl diff -f FILE` shows what applying one would change.\n\nExamples:\n  # Apply one manifest\n  kubectl apply -f manifests/notifier.yaml\n\n  # Apply every manifest in a folder\n  kubectl apply -f manifests/\n\n  # Check a manifest without changing anything\n  kubectl apply -f manifests/notifier.yaml --dry-run=server\n\nUsage:\n  kubectl apply (-f FILENAME | -k DIRECTORY) [options]",
  run: (ctx, inv): Output => {
    const t = target(ctx, inv.flags)
    if (!t.ok) return fail(t.error)
    const dryRunText = str(inv.flags, 'dry-run') ?? 'none'
    if (!(DRY_RUN as readonly string[]).includes(dryRunText))
      return fail(
        `error: Invalid dry-run value (${dryRunText}). Must be "none", "server", or "client".`,
      )
    const dryRun = dryRunText !== 'none'
    const suffix =
      dryRunText === 'client' ? ' (dry run)' : dryRunText === 'server' ? ' (server dry run)' : ''
    const read = manifestFiles(ctx.sim, str(inv.flags, 'filename'), bool(inv.flags, 'recursive'))
    if (!read.ok) return fail(read.error)
    const out: string[] = []
    const errors: string[] = []
    for (const file of read.files) {
      const parsed = parseManifests(file.content)
      if (!parsed.ok) {
        errors.push(`error: error parsing ${file.source}: ${parsed.error}`)
        continue
      }
      if (!parsed.docs.length) errors.push(`error: no objects passed to apply`)
      for (const doc of parsed.docs) {
        const r = applyObject(ctx.sim, t.target.cluster, doc, {
          source: file.source,
          namespace: t.target.namespace,
          namespaceFlag: str(inv.flags, 'namespace') !== undefined,
          dryRun,
          verb: 'apply',
        })
        if (!r.ok) {
          errors.push(r.error)
          continue
        }
        if (r.warning && !dryRun) errors.push(r.warning)
        const type = resolveType(r.kind.toLowerCase())
        out.push(`${type ? nameGroup(type) : r.kind.toLowerCase()}/${r.name} ${r.action}${suffix}`)
        if (!dryRun && r.action !== 'unchanged')
          mutated(ctx, inv, t.target, {
            verb: 'apply',
            kind: r.kind,
            name: r.name,
            namespaced: r.kind !== 'Namespace',
            detail: { action: r.action, source: file.source },
          })
      }
    }
    const failed = errors.some((e) => !e.startsWith('Warning: '))
    return { stdout: out.join('\n'), stderr: errors.join('\n'), exitCode: failed ? 1 : 0 }
  },
})
