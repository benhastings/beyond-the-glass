/**
 * Seeded pseudo-random numbers (mulberry32). The simulator never uses `Math.random()`: the same seed
 * always gives the same sequence, and the 32-bit state is all a snapshot needs to continue it.
 */
export class Rng {
  private s: number

  constructor(seed: number | string) {
    this.s = typeof seed === 'number' ? seed >>> 0 : fnv1a32(seed)
  }

  /** Current internal state, for snapshots. `Rng.fromState(rng.state)` continues the same sequence. */
  get state(): number {
    return this.s
  }

  static fromState(state: number): Rng {
    const r = new Rng(0)
    r.s = state >>> 0
    return r
  }

  /** A float in [0, 1). */
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0
    let t = this.s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  /** An integer in [0, max). */
  int(max: number): number {
    if (!Number.isInteger(max) || max <= 0) throw new RangeError(`max must be a positive integer`)
    return Math.floor(this.next() * max)
  }

  /** One element of a non-empty array. */
  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new RangeError('cannot pick from an empty array')
    return items[this.int(items.length)] as T
  }

  /** `n` lowercase hex characters. */
  hex(n: number): string {
    let out = ''
    while (out.length < n) out += (this.int(0x10000) | 0x10000).toString(16).slice(1)
    return out.slice(0, n)
  }
}

/** 32-bit FNV-1a over the UTF-16 code units of a string. */
export function fnv1a32(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}
