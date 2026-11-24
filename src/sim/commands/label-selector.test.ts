import { describe, expect, it } from 'vitest'
import { parseSelector } from './label-selector'

describe('parseSelector', () => {
  it('parses equality and set-based requirements', () => {
    expect(parseSelector('app=web,tier==front, env!=prod')).toEqual({
      ok: true,
      selector: {
        matchLabels: { app: 'web', tier: 'front' },
        matchExpressions: [{ key: 'env', operator: 'NotIn', values: ['prod'] }],
      },
    })
    expect(
      parseSelector('env in (a, b),zone notin (c),release,!canary,app.kubernetes.io/name=x'),
    ).toEqual({
      ok: true,
      selector: {
        matchLabels: { 'app.kubernetes.io/name': 'x' },
        matchExpressions: [
          { key: 'env', operator: 'In', values: ['a', 'b'] },
          { key: 'zone', operator: 'NotIn', values: ['c'] },
          { key: 'release', operator: 'Exists' },
          { key: 'canary', operator: 'DoesNotExist' },
        ],
      },
    })
    expect(parseSelector('app=')).toEqual({ ok: true, selector: { matchLabels: { app: '' } } })
  })

  it.each(['', 'a,,b', '=x', '!', 'a b c', 'bad key=x', '-x in (a)', '!-x'])(
    'rejects %j',
    (text) => {
      expect(parseSelector(text)).toEqual({
        ok: false,
        error: `error: unable to parse requirement: invalid selector "${text}"`,
      })
    },
  )
})
