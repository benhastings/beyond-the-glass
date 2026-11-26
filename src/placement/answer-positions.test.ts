import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { displayOptions } from '../content/checks.ts'
import { bankSchema, displayOrder, NOT_SURE } from './bank.ts'

const ROOT = join(import.meta.dirname, '../..')
const bank = bankSchema.parse(
  parse(readFileSync(join(ROOT, 'content/threshold/bank.yaml'), 'utf8')),
)
const scenarios = bank.items.filter((i) => i.kind === 'scenario')

/** The share of correct answers at each position (0-based), and how many there were. */
function spread(positions: number[]) {
  const counts = new Map<number, number>()
  for (const p of positions) counts.set(p, (counts.get(p) ?? 0) + 1)
  return { n: positions.length, max: Math.max(...counts.values()) / positions.length, counts }
}

describe('#145 where the correct answer sits', () => {
  it('Threshold scenario items show their correct answer spread across positions', () => {
    const s = spread(scenarios.map((i) => displayOrder(i).findIndex((o) => o.id === i.correct)))
    expect(s.n).toBeGreaterThanOrEqual(10)
    expect(s.max, JSON.stringify([...s.counts])).toBeLessThanOrEqual(0.4)
    // Not one position for every item, and not first for most.
    expect(s.counts.size).toBeGreaterThan(1)
    expect((s.counts.get(0) ?? 0) / s.n).toBeLessThanOrEqual(0.4)
  })

  it('"I’m not sure yet" is always the last option shown', () => {
    for (const i of scenarios) {
      const shown = displayOrder(i)
      expect(shown.at(-1)?.id, i.id).toBe(NOT_SURE)
      expect(
        [...shown].sort((a, b) => a.id.localeCompare(b.id)),
        i.id,
      ).toEqual([...i.options].sort((a, b) => a.id.localeCompare(b.id)))
    }
    // Experience items keep their order (least to most).
    for (const i of bank.items.filter((x) => x.kind === 'experience'))
      expect(displayOrder(i), i.id).toEqual(i.options)
  })

  it('lesson knowledge checks show their correct answer spread across positions too', () => {
    const walk = (d: string): string[] =>
      readdirSync(d).flatMap((n) => {
        const p = join(d, n)
        return statSync(p).isDirectory() ? walk(p) : [p]
      })
    const positions = walk(join(ROOT, 'content/regions'))
      .filter((f) => f.endsWith('.checks.yaml'))
      .flatMap(
        (f) =>
          (
            parse(readFileSync(f, 'utf8')) as {
              checks: { id: string; type: string; options?: { correct?: boolean }[] }[]
            }
          ).checks,
      )
      .filter((c) => c.type === 'single' && c.options)
      .map((c) =>
        displayOptions({ id: c.id, options: c.options ?? [] }).findIndex((o) => o.correct === true),
      )
    const s = spread(positions)
    // Meaningful once there are enough checks to have a pattern.
    if (s.n >= 10) expect(s.max, JSON.stringify([...s.counts])).toBeLessThanOrEqual(0.4)
    expect(positions.every((p) => p >= 0)).toBe(true)
  })
})
