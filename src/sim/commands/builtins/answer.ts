import { defineCommand, fail, ok } from '../types.ts'

/** `answer QUESTION TEXT…`: answers a question in the challenge you're working on (E6-10). */
export const answerCommand = defineCommand({
  path: ['answer'],
  summary: 'Answer a question in the current challenge',
  usage: 'answer QUESTION TEXT…',
  flags: [],
  help: () =>
    'answer QUESTION TEXT…\n  Answers one of the current challenge’s questions, e.g. `answer failing-pod ravenpost-notifier`.\n  You can answer as often as you like; the latest answer counts.',
  run: (ctx, inv) => {
    const [question, ...words] = inv.args
    if (!ctx.session.answer)
      return fail('There’s no challenge running in this terminal, so there’s nothing to answer.')
    if (!question || !words.length)
      return fail(
        'Usage: answer QUESTION TEXT… (for example `answer failing-pod ravenpost-notifier`)',
      )
    return ok(ctx.session.answer(question, words.join(' ')))
  },
})
