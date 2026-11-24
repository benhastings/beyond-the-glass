import { tabwrite } from '../format.ts'
import type { CommandDef } from '../types.ts'
import { defineCommand, ok } from '../types.ts'

/** `help` lists every registered command, so it can't drift from the registry. */
export function helpCommandFor(commands: () => readonly CommandDef[]): CommandDef {
  return defineCommand({
    path: ['help'],
    summary: 'List the commands this terminal supports',
    usage: 'help [COMMAND]',
    flags: [],
    help: () =>
      'help [COMMAND]\n  Lists the commands this terminal supports, or shows help for one (for example `help kubectl get`).',
    run: (_ctx, inv) => {
      if (inv.args.length) {
        const def = commands().find((c) => c.path.join(' ') === inv.args.join(' '))
        if (def) return ok(def.help())
        return {
          stdout: '',
          stderr: `help: no help topics match \`${inv.args.join(' ')}'.  Try \`help' to see the list.`,
          exitCode: 1,
        }
      }
      const rows = commands().map((c) => [c.usage, c.summary])
      return ok(
        [
          'This terminal talks to a simulated cluster. It supports:',
          '',
          tabwrite(rows),
          '',
          'After a pipe (|): grep [-i] [-v] PATTERN, head [-n N], tail [-n N], wc -l',
          'Keys: Tab completes, Up/Down step through history, Ctrl+L clears, Ctrl+C cancels.',
          'Add --help to any command for details.',
        ].join('\n'),
      )
    },
  })
}
