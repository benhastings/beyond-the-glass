import { readdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { ROOT } from './helpers.ts'

describe('E6-13 sim inspector', () => {
  it('[E6-13.AC1] is not in the production bundle', () => {
    const dist = join(ROOT, 'node_modules', '.tmp', 'inspector-dist')
    try {
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
      const js = readdirSync(join(dist, 'assets')).filter((f) => f.endsWith('.js'))
      expect(js.length).toBeGreaterThan(0)
      for (const f of js) {
        const code = readFileSync(join(dist, 'assets', f), 'utf8')
        expect(code, f).not.toContain('btg-sim-inspector')
        expect(code, f).not.toContain('Sim inspector')
      }
    } finally {
      rmSync(dist, { recursive: true, force: true })
    }
  }, 180_000)
})
