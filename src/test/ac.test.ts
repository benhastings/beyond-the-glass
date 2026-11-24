import { describe, expect } from 'vitest'
import { acTest } from './ac'
import { acTitle } from './ac-title'

describe('acTest helpers', () => {
  acTest('E0-10.AC2', 'acTitle prefixes the tags the way the tracer reads them', () => {
    expect(acTitle('E6-04.AC2', 'parser never throws')).toBe('[E6-04.AC2] parser never throws')
    expect(acTitle(['E5-07.AC1', 'E3.SC1'], 'journey')).toBe('[E5-07.AC1] [E3.SC1] journey')
  })

  acTest('E0-10.AC2', 'acTitle rejects malformed tags before they reach the tracer', () => {
    // @ts-expect-error -- a malformed tag is also a type error
    expect(() => acTitle('E6-04-AC2', 'x')).toThrow(/criterion tag/)
    expect(() => acTitle([], 'x')).toThrow(/at least one/)
  })
})
