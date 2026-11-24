import { defineCommand } from '../types.ts'

export const clearCommand = defineCommand({
  path: ['clear'],
  summary: 'Clear the terminal (Ctrl+L)',
  usage: 'clear',
  flags: [],
  help: () => 'clear\n  Clears the terminal screen. Ctrl+L does the same. Your history is kept.',
  run: () => ({ stdout: '', stderr: '', exitCode: 0, effect: 'clear' }),
})
