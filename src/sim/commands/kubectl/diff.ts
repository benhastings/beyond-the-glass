import { fnv1a32 } from '../../core/rng.ts'
import type { Resource } from '../../core/resources.ts'
import { bool, str } from '../flags.ts'
import { printerFor } from '../printers/index.ts'
import type { PrintContext } from '../printers/types.ts'
import { resolveType } from '../resource-types.ts'
import { defineCommand, fail, type Output } from '../types.ts'
import { unifiedHunks } from '../unified-diff.ts'
import { manifestFiles } from './file-args.ts'
import { kubectlYaml } from './get.ts'
import { target } from './globals.ts'
import { applyObject, parseManifests } from './manifests.ts'

/** The API view `get -o yaml` shows (Secrets redacted), as the text diff compares. */
function view(o: Resource | undefined, pctx: PrintContext): string {
  if (!o) return ''
  const p = printerFor(resolveType(o.kind.toLowerCase())?.plural ?? '')
  const api = p?.toApi ? p.toApi(o, pctx) : o
  return `${kubectlYaml(api)}\n`
}

/**
 * `kubectl diff -f` (E6-08): what applying would change, as a unified diff of each object's live and
 * merged YAML, with the same `diff -u -N` headers. Exit 1 when there are differences, 0 when none.
 */
export const kubectlDiff = defineCommand({
  path: ['kubectl', 'diff'],
  summary: 'Show what applying manifest files would change',
  usage: 'kubectl diff -f FILE|DIR [-R] [-n NS]',
  flags: [
    { name: 'filename', short: 'f', type: 'string', description: 'Manifest file or folder' },
    { name: 'recursive', short: 'R', type: 'bool', description: 'Include subfolders of a folder' },
  ],
  help: () =>
    'Diff configurations specified by file name between the current online configuration, and the\nconfiguration as it would be if applied. The output is a unified diff: lines starting with - are\nremoved, lines starting with + are added.\n\nExit status:\n 0 No differences were found.\n 1 Differences were found.\n\nExamples:\n  kubectl diff -f manifests/notifier.yaml\n\nUsage:\n  kubectl diff -f FILENAME [options]',
  run: (ctx, inv): Output => {
    const t = target(ctx, inv.flags)
    if (!t.ok) return fail(t.error)
    const read = manifestFiles(ctx.sim, str(inv.flags, 'filename'), bool(inv.flags, 'recursive'))
    if (!read.ok) return fail(read.error)
    const seed = fnv1a32(`${String(ctx.sim.now)}/${read.files.map((f) => f.source).join(',')}`)
    const liveDir = `/tmp/LIVE-${String(seed % 4_000_000_000)}`
    const mergedDir = `/tmp/MERGED-${String(fnv1a32(String(seed)) % 4_000_000_000)}`
    const stamp = `${ctx.sim.clock.iso().replace('T', ' ').replace('Z', '')}.000000000 +0000`
    const out: string[] = []
    const errors: string[] = []
    for (const file of read.files) {
      const parsed = parseManifests(file.content)
      if (!parsed.ok) {
        errors.push(`error: error parsing ${file.source}: ${parsed.error}`)
        continue
      }
      for (const doc of parsed.docs) {
        const r = applyObject(ctx.sim, t.target.cluster, doc, {
          source: file.source,
          namespace: t.target.namespace,
          namespaceFlag: str(inv.flags, 'namespace') !== undefined,
          dryRun: true,
          verb: 'apply',
        })
        if (!r.ok) {
          errors.push(r.error)
          continue
        }
        // The merged object as the server would store it: a changed spec bumps the generation.
        const pctx = { cluster: t.target.cluster, clock: ctx.sim.clock }
        const hunks = unifiedHunks(view(r.before, pctx), view(r.after, pctx))
        if (!hunks) continue
        const group = r.kind === 'Deployment' ? 'apps.v1' : 'v1'
        const name = `${group}.${r.kind}.${r.namespace ? `${r.namespace}.` : ''}${r.name}`
        out.push(
          `diff -u -N ${liveDir}/${name} ${mergedDir}/${name}`,
          `--- ${liveDir}/${name}\t${stamp}`,
          `+++ ${mergedDir}/${name}\t${stamp}`,
          hunks,
        )
      }
    }
    return {
      stdout: out.join('\n'),
      stderr: errors.join('\n'),
      exitCode: errors.length || out.length ? 1 : 0,
    }
  },
})
