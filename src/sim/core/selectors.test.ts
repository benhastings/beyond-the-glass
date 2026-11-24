import { describe, expect, it } from 'vitest'
import { matchesMap, matchesSelector } from './selectors'

describe('label selectors', () => {
  const labels = { app: 'api', tier: 'backend' }
  it('matches matchLabels', () => {
    expect(matchesSelector(labels, { matchLabels: { app: 'api' } })).toBe(true)
    expect(matchesSelector(labels, { matchLabels: { app: 'web' } })).toBe(false)
    expect(matchesSelector(undefined, { matchLabels: {} })).toBe(true)
    expect(matchesSelector(labels, undefined)).toBe(false)
  })
  it('matches set-based expressions', () => {
    const m = (
      operator: 'In' | 'NotIn' | 'Exists' | 'DoesNotExist',
      key: string,
      values?: string[],
    ) =>
      matchesSelector(labels, {
        matchExpressions: [{ key, operator, ...(values ? { values } : {}) }],
      })
    expect(m('In', 'app', ['api', 'web'])).toBe(true)
    expect(m('In', 'app', ['web'])).toBe(false)
    expect(m('In', 'missing', ['x'])).toBe(false)
    expect(m('NotIn', 'app', ['web'])).toBe(true)
    expect(m('NotIn', 'app', ['api'])).toBe(false)
    expect(m('Exists', 'tier')).toBe(true)
    expect(m('Exists', 'zone')).toBe(false)
    expect(m('DoesNotExist', 'zone')).toBe(true)
    expect(m('DoesNotExist', 'tier')).toBe(false)
  })
  it('treats an empty Service selector as selecting nothing', () => {
    expect(matchesMap(labels, {})).toBe(false)
    expect(matchesMap(labels, undefined)).toBe(false)
    expect(matchesMap(labels, { app: 'api' })).toBe(true)
  })
})
