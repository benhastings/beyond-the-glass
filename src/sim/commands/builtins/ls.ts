import { list, resolvePath, stat } from '../../core/files.ts'
import { bool } from '../flags.ts'
import { defineCommand } from '../types.ts'

/** `ls` over the scenario's files (E6-08). */
export const lsCommand = defineCommand({
  path: ['ls'],
  summary: 'List the files in a folder',
  usage: 'ls [-l] [PATH…]',
  flags: [{ name: 'long', short: 'l', type: 'bool', description: 'One per line, with sizes' }],
  help: () =>
    'ls [-l] [PATH…]\n  Lists the files in your home folder (or PATH). Folders end in /. The manifests here are what\n  `kubectl apply -f` reads.',
  run: (ctx, inv) => {
    const targets = inv.args.length ? inv.args : ['.']
    const out: string[] = []
    const errors: string[] = []
    const long = bool(inv.flags, 'long')
    for (const arg of targets) {
      const e = stat(ctx.sim, resolvePath(ctx.sim, arg))
      if (!e) {
        errors.push(`ls: cannot access '${arg}': No such file or directory`)
        continue
      }
      const entries = e.type === 'dir' ? list(ctx.sim, e.path) : [e]
      if (targets.length > 1 && e.type === 'dir') out.push(`${out.length ? '\n' : ''}${arg}:`)
      const name = (x: (typeof entries)[number]) =>
        `${e.type === 'dir' ? (x.path.split('/').pop() ?? '') : arg}${x.type === 'dir' ? '/' : ''}`
      if (long)
        for (const x of entries)
          out.push(
            `${x.type === 'dir' ? 'drwxr-xr-x' : '-rw-r--r--'} operator operator ${String(x.type === 'file' ? new TextEncoder().encode(x.content).length : 4096).padStart(6)} ${name(x)}`,
          )
      else if (entries.length) out.push(entries.map(name).join('  '))
    }
    return { stdout: out.join('\n'), stderr: errors.join('\n'), exitCode: errors.length ? 2 : 0 }
  },
  complete: (ctx, _words, partial) => {
    const dir = partial.includes('/') ? partial.slice(0, partial.lastIndexOf('/') + 1) : ''
    return list(ctx.sim, resolvePath(ctx.sim, dir || '.'))
      .map((e) => `${dir}${e.path.split('/').pop() ?? ''}${e.type === 'dir' ? '/' : ''}`)
      .filter((n) => n.startsWith(partial))
  },
})
