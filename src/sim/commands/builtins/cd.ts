import { changeDir, HOME, list, resolvePath, stat } from '../../core/files.ts'
import { defineCommand, fail, ok } from '../types.ts'

/** `cd` within the scenario's files (E6-08). */
export const cdCommand = defineCommand({
  path: ['cd'],
  summary: 'Move to another folder',
  usage: 'cd [FOLDER]',
  flags: [],
  help: () =>
    'cd [FOLDER]\n  Moves to FOLDER (or back to your home folder, ~). `cd ..` goes up one.',
  run: (ctx, inv) => {
    const arg = inv.args[0]
    const abs = arg === undefined ? HOME : resolvePath(ctx.sim, arg)
    const e = stat(ctx.sim, abs)
    if (!e) return fail(`cd: ${arg ?? ''}: No such file or directory`)
    if (e.type === 'file') return fail(`cd: ${arg ?? ''}: Not a directory`)
    changeDir(ctx.sim, abs)
    return ok('')
  },
  complete: (ctx, _words, partial) => {
    const dir = partial.includes('/') ? partial.slice(0, partial.lastIndexOf('/') + 1) : ''
    return list(ctx.sim, resolvePath(ctx.sim, dir || '.'))
      .filter((e) => e.type === 'dir')
      .map((e) => `${dir}${e.path.split('/').pop() ?? ''}/`)
      .filter((n) => n.startsWith(partial))
  },
})
