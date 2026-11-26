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

  it('[E10-04.AC4] keeps the war room in its own chunk, which index.html does not load', () => {
    const html = readFileSync(join(dist, 'index.html'), 'utf8')
    const room = js.filter(({ code }) => code.includes('btg-war-room'))
    expect(room.map((x) => x.file)).toHaveLength(1)
    const file = room[0]?.file ?? ''
    expect(html).not.toContain(file)
    // Nor does anything the first page loads import it statically.
    const entry = /src="\.\/assets\/([^"]+\.js)"/.exec(html)?.[1] ?? ''
    expect(entry).not.toBe('')
    expect(entry).not.toBe(file)
    const staticImports = (code: string) =>
      [...code.matchAll(/(?:^|[;\s])import\s*(?:[\w${},*\s]+from\s*)?"\.\/([^"]+)"/g)].map(
        (m) => m[1],
      )
    const loaded = new Set<string>()
    const visit = (f: string) => {
      if (loaded.has(f)) return
      loaded.add(f)
      for (const dep of staticImports(js.find((x) => x.file === f)?.code ?? '')) if (dep) visit(dep)
    }
    visit(entry)
    // The walk did follow the entry's imports (vendor and app chunks).
    expect(loaded.size).toBeGreaterThan(1)
    expect([...loaded]).not.toContain(file)
  })
})
