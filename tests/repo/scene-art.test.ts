import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { ROOT } from './helpers.ts'

const gz = (files: string[]) =>
  files.reduce((n, f) => n + gzipSync(readFileSync(join(ROOT, f))).length, 0)

describe('scene art', () => {
  it('[E1-04.AC1] the Console Room scene is at most 120 KB gzipped', () => {
    const size = gz(['src/app/art/ConsoleRoomScene.tsx', 'src/app/art/scene.css'])
    expect(size).toBeLessThanOrEqual(120 * 1024)
  })

  it('idle motion: every loop ends within five seconds, and nothing repeats faster than 3 Hz', () => {
    const css = readFileSync(join(ROOT, 'src/app/art/scene.css'), 'utf8')
    const rules = [...css.matchAll(/animation:\s*[\w-]+\s+([\d.]+)s\s+[^;]*?\s(\d+)(?:\s+\w+)?;/g)]
    expect(rules.length).toBeGreaterThanOrEqual(3)
    for (const [, dur, count] of rules) {
      expect(Number(dur) * Number(count)).toBeLessThanOrEqual(5)
      expect(1 / Number(dur)).toBeLessThanOrEqual(3)
    }
    expect(css).not.toMatch(/infinite/)
  })
})
