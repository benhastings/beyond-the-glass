import { LineCounter, parseDocument } from 'yaml'
import { challengeSchema, type Challenge } from '../sim/challenges/schema.ts'

/** Parses and validates challenge YAML, throwing with `file:line path: message` for every problem. */
export function parseChallenge(source: string, file: string): Challenge {
  const lc = new LineCounter()
  const doc = parseDocument(source, { lineCounter: lc })
  const yamlErr = doc.errors[0]
  if (yamlErr)
    throw new Error(
      `Invalid challenge:\n  ${file}:${String(yamlErr.linePos?.[0].line ?? 1)} ${yamlErr.message}`,
    )
  const r = challengeSchema.safeParse(doc.toJS())
  if (!r.success)
    throw new Error(
      `Invalid challenge:\n${r.error.issues.map((i) => `  ${file} ${i.path.join('.')}: ${i.message}`).join('\n')}`,
    )
  const ids = new Set(r.data.questions.map((q) => q.id))
  for (const o of r.data.objectives)
    if (o.check.type === 'answered' && !ids.has(o.check.question))
      throw new Error(
        `Invalid challenge:\n  ${file} objectives.${o.id}: no question "${o.check.question}"`,
      )
  return r.data
}
