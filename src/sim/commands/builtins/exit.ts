import { defineCommand } from '../types.ts'

export const exitCommand = defineCommand({
  path: ['exit'],
  summary: 'Close the terminal panel',
  usage: 'exit',
  flags: [],
  help: () =>
    'exit\n  Closes the terminal panel. The cluster keeps its state; reopen the terminal to carry on.',
  run: () => ({ stdout: '', stderr: '', exitCode: 0, effect: 'exit' }),
})
