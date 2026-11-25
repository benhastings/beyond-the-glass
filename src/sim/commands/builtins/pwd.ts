import { cwd } from '../../core/files.ts'
import { defineCommand, ok } from '../types.ts'

/** `pwd` (E6-08). */
export const pwdCommand = defineCommand({
  path: ['pwd'],
  summary: 'Show which folder you’re in',
  usage: 'pwd',
  flags: [],
  help: () => 'pwd\n  Prints the folder you’re in.',
  run: (ctx) => ok(cwd(ctx.sim)),
})
