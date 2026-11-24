import { defineCommand, ok } from '../types.ts'

export const hintCommand = defineCommand({
  path: ['hint'],
  summary: 'A nudge for the current challenge',
  usage: 'hint',
  flags: [],
  help: () =>
    'hint\n  Gives the next hint for the challenge you are working on: first a nudge, then a pointer, then the exact command. Hints never stop you completing a challenge.',
  run: (ctx) =>
    ok(
      ctx.session.hint?.() ??
        "There's no challenge running in this terminal, so there's no hint to give. A good first look is `kubectl get pods -A`.",
    ),
})
