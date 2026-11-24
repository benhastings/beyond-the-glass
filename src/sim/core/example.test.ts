import { describe, expect, it } from 'vitest'
import { clamp } from './example'

// Example unit test for a framework-free package: runs in plain Node, no DOM.
describe('clamp', () => {
  it('keeps values inside the range', () => {
    expect(clamp(5, 0, 10)).toBe(5)
    expect(clamp(-1, 0, 10)).toBe(0)
    expect(clamp(11, 0, 10)).toBe(10)
  })
  it('rejects an inverted range', () => {
    expect(() => clamp(1, 10, 0)).toThrow(RangeError)
  })
})
