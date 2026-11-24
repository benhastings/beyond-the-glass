import { describe, expect, it } from 'vitest'
import { DEFAULT_START, SimClock } from './clock'
import { isDuration, parseDuration } from './duration'

describe('parseDuration', () => {
  it.each([
    ['+4m', 240_000],
    ['90s', 90_000],
    ['1h30m', 5_400_000],
    ['-3d', -259_200_000],
    ['250ms', 250],
    ['2d4h', 187_200_000],
  ])('%s → %d ms', (text, ms) => {
    expect(parseDuration(text)).toBe(ms)
    expect(isDuration(text)).toBe(true)
  })

  it.each(['', '4', 'm', '+4 m', '4min', '1.5h', 'soon'])('rejects %j', (text) => {
    expect(() => parseDuration(text)).toThrow(SyntaxError)
    expect(isDuration(text)).toBe(false)
  })
})

describe('SimClock', () => {
  it('starts at zero and only moves forward', () => {
    const c = new SimClock()
    expect(c.now).toBe(0)
    expect(c.iso()).toBe(DEFAULT_START)
    c.advance(61_000)
    expect(c.iso()).toBe('2026-03-14T02:11:01Z')
    expect(() => {
      c.set(1000)
    }).toThrow(RangeError)
  })

  it('resolves relative and absolute times', () => {
    const c = new SimClock('2026-01-01T00:00:00Z')
    expect(c.resolve('-1h')).toBe(-3_600_000)
    expect(c.resolve('+4m')).toBe(240_000)
    expect(c.resolve('2026-01-01T00:00:30Z')).toBe(30_000)
    expect(c.iso(c.resolve('-1d'))).toBe('2025-12-31T00:00:00Z')
    expect(() => c.resolve('2026-13-45T99:00:00Z')).toThrow(RangeError)
  })

  it('rejects an invalid start time', () => {
    expect(() => new SimClock('yesterday')).toThrow(RangeError)
  })
})
