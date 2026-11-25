import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ROOT } from './helpers.ts'

/** One production build, checked for code that must never ship. */
describe('the production bundle', () => {
  const dist = join(ROOT, 'node_modules', '.tmp', 'production-dist')
  let js: { file: string; code: string }[] = []
  beforeAll(() => {
    // As CI builds it: production mode (vitest itself runs with NODE_ENV=test).
    execFileSync(
      'npx',
      ['vite', 'build', '--outDir', dist, '--emptyOutDir', '--logLevel', 'error'],
      {
        cwd: ROOT,
        stdio: 'pipe',
        env: { ...process.env, NODE_ENV: 'production', CI: '1' },
      },
    )
    js = readdirSync(join(dist, 'assets'))
      .filter((f) => f.endsWith('.js'))
      .map((file) => ({ file, code: readFileSync(join(dist, 'assets', file), 'utf8') }))
  }, 180_000)
  afterAll(() => {
    rmSync(dist, { recursive: true, force: true })
  })

  it('[E6-13.AC1] does not contain the sim inspector', () => {
    expect(js.length).toBeGreaterThan(0)
    for (const { file, code } of js) {
      expect(code, file).not.toContain('btg-sim-inspector')
      expect(code, file).not.toContain('Sim inspector')
    }
  })

  it('[E5-02.AC2] does not contain the Mermaid runtime (diagrams are SVG from the build)', () => {
    for (const { file, code } of js) {
      expect(code, file).not.toMatch(/mermaidAPI|securityLevel|parseDirective/)
    }
    // The diagrams themselves are there, as SVG.
    expect(js.some(({ code }) => code.includes('flowchart-v2'))).toBe(true)
  })
})
