import { describe, expect, it } from 'vitest'
import { fnv1a32, Rng } from './rng'

describe('Rng', () => {
  it('gives the same sequence for the same seed, and a different one for another seed', () => {
    const seq = (seed: number | string) => {
      const r = new Rng(seed)
      return Array.from({ length: 5 }, () => r.next())
    }
    expect(seq(42)).toEqual(seq(42))
    expect(seq('ravenpost')).toEqual(seq('ravenpost'))
    expect(seq(42)).not.toEqual(seq(43))
  })

  it('continues the same sequence from its state', () => {
    const a = new Rng(7)
    a.next()
    a.next()
    const b = Rng.fromState(a.state)
    expect([b.next(), b.next()]).toEqual([a.next(), a.next()])
  })

  it('keeps values in range', () => {
    const r = new Rng(1)
    for (let i = 0; i < 1000; i++) {
      const f = r.next()
      expect(f).toBeGreaterThanOrEqual(0)
      expect(f).toBeLessThan(1)
      expect(r.int(6)).toBeLessThan(6)
    }
    expect(r.hex(13)).toMatch(/^[0-9a-f]{13}$/)
    expect(['a', 'b']).toContain(r.pick(['a', 'b']))
  })

  it('rejects impossible requests', () => {
    const r = new Rng(1)
    expect(() => r.int(0)).toThrow(RangeError)
    expect(() => r.int(1.5)).toThrow(RangeError)
    expect(() => r.pick([])).toThrow(RangeError)
  })

  it('hashes strings with FNV-1a', () => {
    expect(fnv1a32('')).toBe(0x811c9dc5)
    expect(fnv1a32('a')).toBe(0xe40c292c)
  })
})
