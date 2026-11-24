import { describe, expect, it } from 'vitest'
import { tokenize } from './tokenize'

const stages = (line: string) => {
  const t = tokenize(line)
  if (!t.ok) throw new Error(t.error)
  return t.stages
}

describe('tokenize', () => {
  it('splits words and pipe stages', () => {
    expect(stages('kubectl get pods -A | grep -v Running | wc -l')).toEqual([
      ['kubectl', 'get', 'pods', '-A'],
      ['grep', '-v', 'Running'],
      ['wc', '-l'],
    ])
    expect(stages('  kubectl\tget   pods  ')).toEqual([['kubectl', 'get', 'pods']])
    expect(stages('')).toEqual([])
    expect(stages('a|b')).toEqual([['a'], ['b']])
  })

  it('handles quotes, escapes and flags with values', () => {
    expect(stages(`grep "Back-off restarting" 'it''s' --selector=app=web -l "a in (b,c)"`)).toEqual(
      [['grep', 'Back-off restarting', 'its', '--selector=app=web', '-l', 'a in (b,c)']],
    )
    expect(stages('echo "a \\"quoted\\" word" a\\ b \'\\n\' ""')).toEqual([
      ['echo', 'a "quoted" word', 'a b', '\\n', ''],
    ])
    expect(stages('grep "a|b"')).toEqual([['grep', 'a|b']])
    expect(stages('trailing\\')).toEqual([['trailing']])
  })

  it('reports unbalanced quotes and empty pipe stages like bash', () => {
    expect(tokenize('grep "oops')).toEqual({
      ok: false,
      error: 'bash: unexpected EOF while looking for matching `"\'',
    })
    expect(tokenize("grep 'oops")).toEqual({
      ok: false,
      error: "bash: unexpected EOF while looking for matching `''",
    })
    expect(tokenize('| grep x')).toEqual({
      ok: false,
      error: "bash: syntax error near unexpected token `|'",
    })
    expect(tokenize('kubectl get pods |')).toEqual({
      ok: false,
      error: "bash: syntax error near unexpected token `|'",
    })
  })

  it.each([
    'a && b',
    'a || b',
    'a; b',
    'a > f',
    'a < f',
    'a &',
    'echo $(date)',
    'echo `date`',
    'echo "$(date)"',
  ])('explains that %j is not supported', (line) => {
    const t = tokenize(line)
    expect(t.ok).toBe(false)
    if (!t.ok) expect(t.error).toMatch(/^This terminal runs one command at a time/)
  })
})
