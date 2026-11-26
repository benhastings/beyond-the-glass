import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(import.meta.dirname, '../..')
const HANDBOOK = 'docs/sim/ravenpost.md'

describe('E10-01 the Ravenpost handbook', () => {
  it('[E10-01.AC2] its diagrams are rendered by the build-time Mermaid step, linked, and content-guard passes', () => {
    const md = readFileSync(join(ROOT, HANDBOOK), 'utf8')
    const hashes = [...md.matchAll(/```mermaid\n([\s\S]*?)```/g)].map((m) =>
      createHash('sha256')
        .update((m[1] ?? '').trim())
        .digest('hex')
        .slice(0, 16),
    )
    expect(hashes.length).toBeGreaterThanOrEqual(2)
    for (const h of hashes) {
      expect(existsSync(join(ROOT, `docs/diagrams/${h}.svg`)), h).toBe(true)
      expect(readFileSync(join(ROOT, `docs/diagrams/${h}.svg`), 'utf8')).toMatch(/^<svg /)
      // Linked with alt text, for readers who don't see the Mermaid source rendered.
      expect(md).toMatch(new RegExp(`!\\[[^\\]]{20,}\\]\\(\\.\\./diagrams/${h}\\.svg\\)`))
    }
    // The same check CI runs: nothing unrendered, unused or unlinked.
    execFileSync('node', ['scripts/render-diagrams.mjs', '--check'], { cwd: ROOT, stdio: 'pipe' })
    const g = spawnSync('node', ['scripts/content-guard.mjs'], { cwd: ROOT, encoding: 'utf8' })
    expect(g.stdout + g.stderr).not.toMatch(
      /(docs\/sim\/ravenpost\.md|src\/scenarios\/stormwatch\.yaml):\d+/,
    )
    expect(g.status, g.stdout).toBe(0)
  }, 60_000)
})
