import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ROOT } from './helpers.ts'

describe('E4-03 placement engine coverage', () => {
  it('[E4-03.AC3] src/placement reaches at least 95% branch coverage', () => {
    const out = mkdtempSync(join(tmpdir(), 'btg-placement-cov-'))
    try {
      const r = spawnSync(
        'npx',
        [
          'vitest',
          'run',
          '--project',
          'unit',
          'src/placement',
          '--coverage',
          '--coverage.include=src/placement/**',
          '--coverage.exclude=**/*.test.ts',
          '--coverage.reporter=json-summary',
          `--coverage.reportsDirectory=${out}`,
          '--coverage.thresholds.lines=0',
        ],
        { cwd: ROOT, encoding: 'utf8', env: { ...process.env, CI: '', FORCE_COLOR: '0' } },
      )
      expect(r.status, r.stdout + r.stderr).toBe(0)
      const s = JSON.parse(readFileSync(join(out, 'coverage-summary.json'), 'utf8')) as {
        total: { branches: { pct: number } }
      }
      expect(s.total.branches.pct).toBeGreaterThanOrEqual(95)
    } finally {
      rmSync(out, { recursive: true, force: true })
    }
  }, 120_000)
})
