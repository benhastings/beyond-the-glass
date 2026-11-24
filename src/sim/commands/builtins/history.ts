import { defineCommand, ok } from '../types.ts'

export const historyCommand = defineCommand({
  path: ['history'],
  summary: 'List the commands you have run',
  usage: 'history',
  flags: [],
  help: () =>
    'history\n  Lists the commands you have run in this terminal, numbered. Up and Down arrows step through them.',
  // Numbered like bash: right-aligned in five columns, two spaces, the command.
  run: (ctx) =>
    ok(ctx.session.history.map((line, i) => `${String(i + 1).padStart(5)}  ${line}`).join('\n')),
})
