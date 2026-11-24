import { defineCommand, ok } from '../types.ts'

export const whoamiCommand = defineCommand({
  path: ['whoami'],
  summary: 'Who you are on this watch',
  usage: 'whoami',
  flags: [],
  help: () => 'whoami\n  Prints your user name, and your place on the watch.',
  run: (ctx) =>
    ok(
      `operator\n\nYou're the operator on the night watch, signed in to the context ${ctx.sim.currentContext}.`,
    ),
})
