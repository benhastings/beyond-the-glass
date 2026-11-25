import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ROOT } from './helpers.ts'

describe('E5-02 lesson components', () => {
  it('[E5-02.AC3] adding a component is one file plus one registry line', () => {
    const dir = join(ROOT, 'src/app/lesson/components')
    const registry = readFileSync(join(dir, 'index.ts'), 'utf8')
    const files = readdirSync(dir).filter((f) => f.endsWith('.tsx') && !f.endsWith('.test.tsx'))
    expect(files.length).toBeGreaterThanOrEqual(7)
    for (const f of files) {
      const name = f.replace(/\.tsx$/, '')
      // One import line for the file, and its component in the map.
      expect(registry.split(`from './${name}'`).length - 1, f).toBe(1)
      const exported = /export function (\w+)/.exec(readFileSync(join(dir, f), 'utf8'))?.[1] ?? ''
      expect(registry, f).toMatch(new RegExp(`^\\s+(\\w+: )?${exported},$`, 'm'))
    }
  })

  it('every diagram in content/ is rendered, and no rendered SVG is unused', () => {
    expect(() =>
      execFileSync('node', ['scripts/render-diagrams.mjs', '--check'], {
        cwd: ROOT,
        stdio: 'pipe',
      }),
    ).not.toThrow()
  })
})
