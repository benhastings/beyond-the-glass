import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { acTest } from '@/test/ac'
import { contrastPairs, MOODS, REGIONS, tokensCss, type Hex } from './tokens'

/** WCAG 2.x relative luminance and contrast ratio. */
function luminance(hex: Hex): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [
    number,
    number,
    number,
  ]
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}
export function contrast(a: Hex, b: Hex): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

describe('design tokens', () => {
  it('computes contrast the way WCAG does', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5)
    expect(contrast('#ffffff', '#ffffff')).toBe(1)
    expect(contrast('#767676', '#ffffff')).toBeCloseTo(4.54, 2)
  })

  acTest('E1-01.AC2', 'every declared foreground/background pair meets WCAG 2.2 AA', () => {
    const pairs = contrastPairs()
    expect(pairs.length).toBeGreaterThan(150)
    const failures = pairs
      .map((p) => ({ ...p, ratio: contrast(p.fg, p.bg) }))
      .filter((p) => p.ratio < p.min)
      .map(
        (p) =>
          `${p.where}: ${p.fg} on ${p.bg} is ${p.ratio.toFixed(2)}:1, needs ${String(p.min)}:1`,
      )
    expect(failures).toEqual([])
  })

  acTest(
    'E1-01.AC2',
    'every colour token is a 6-digit hex and every mood and region is covered',
    () => {
      const all = JSON.stringify({ MOODS, REGIONS }).match(/"#[^"]*"/g) ?? []
      for (const c of all) expect(c).toMatch(/^"#[0-9a-f]{6}"$/)
      expect(Object.keys(MOODS)).toEqual(['console', 'reach', 'stormwatch'])
      expect(Object.keys(REGIONS)).toEqual([
        'console-room',
        'harbor',
        'helm-keep',
        'chartroom',
        'mirror-lake',
        'signalwood',
        'stormwatch',
      ])
      const where = contrastPairs().map((p) => p.where)
      for (const id of Object.keys(REGIONS)) expect(where).toContain(`${id}: accent on soft`)
    },
  )

  it('tokens.css is generated from tokens.ts and up to date', () => {
    const css = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8')
    expect(css, 'run: node scripts/build-tokens.mjs').toBe(tokensCss())
  })
})
