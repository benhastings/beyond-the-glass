import { describe, expect } from 'vitest'
import { acTest } from '@/test/ac'
import { editDistance, suggest } from './distance'

describe('suggestions', () => {
  acTest(
    'E6-04.AC2',
    'edit distance counts insertions, deletions, substitutions and adjacent swaps as 1',
    () => {
      expect(editDistance('pods', 'pods')).toBe(0)
      expect(editDistance('pdos', 'pods')).toBe(1)
      expect(editDistance('pod', 'pods')).toBe(1)
      expect(editDistance('podss', 'pods')).toBe(1)
      expect(editDistance('gte', 'get')).toBe(1)
      expect(editDistance('dscribe', 'describe')).toBe(1)
      expect(editDistance('deploymnets', 'deployments')).toBe(1)
      expect(editDistance('abc', '')).toBe(3)
      expect(editDistance('kitten', 'sitting')).toBe(3)
    },
  )

  acTest('E6-04.AC2', 'suggest returns candidates within distance 2, closest first', () => {
    expect(suggest('pdos', ['pods', 'pod', 'nodes', 'po'])).toEqual(
      ['pods', 'pod', 'nodes', 'po']
        .filter((c) => editDistance('pdos', c) <= 2)
        .sort((a, b) => editDistance('pdos', a) - editDistance('pdos', b) || (a < b ? -1 : 1)),
    )
    expect(suggest('pdos', ['pods', 'deployments'])).toEqual(['pods'])
    expect(suggest('GTE', ['get', 'set', 'logs'])).toEqual(['get', 'set'])
    expect(suggest('xyzzy', ['get', 'pods'])).toEqual([])
    expect(suggest('get', ['get'])).toEqual([])
    expect(suggest('svcs', ['services', 'svc'], 1)).toEqual(['svc'])
  })
})
