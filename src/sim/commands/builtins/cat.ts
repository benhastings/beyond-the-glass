import { list, resolvePath, stat } from '../../core/files.ts'
import { defineCommand } from '../types.ts'

/** `cat` for the scenario's files (E6-08). */
export const catCommand = defineCommand({
  path: ['cat'],
  summary: 'Print a file',
  usage: 'cat FILE…',
  flags: [],
  help: () => 'cat FILE…\n  Prints files from your home folder, one after another.',
  run: (ctx, inv) => {
    if (!inv.args.length) return { stdout: '', stderr: 'cat: missing file operand', exitCode: 1 }
    const out: string[] = []
    const errors: string[] = []
    for (const arg of inv.args) {
      const e = stat(ctx.sim, resolvePath(ctx.sim, arg))
      if (!e) errors.push(`cat: ${arg}: No such file or directory`)
      else if (e.type === 'dir') errors.push(`cat: ${arg}: Is a directory`)
      else out.push(e.content.replace(/\n$/, ''))
    }
    return { stdout: out.join('\n'), stderr: errors.join('\n'), exitCode: errors.length ? 1 : 0 }
  },
  complete: (ctx, _words, partial) => {
    const dir = partial.includes('/') ? partial.slice(0, partial.lastIndexOf('/') + 1) : ''
    return list(ctx.sim, resolvePath(ctx.sim, dir || '.'))
      .map((e) => `${dir}${e.path.split('/').pop() ?? ''}${e.type === 'dir' ? '/' : ''}`)
      .filter((n) => n.startsWith(partial))
  },
})
