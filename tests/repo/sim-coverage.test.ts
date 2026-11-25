import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PURE_LINES, PURE_PACKAGES } from '../../vitest.config.ts'
import { ROOT } from './helpers.ts'

describe('E6-02 controllers coverage', () => {
  it('[E6-02.AC3] the controllers reach at least 90% line coverage, and CI holds them to it', () => {
    // CI's coverage gate applies the 90% bar to everything under src/sim.
    expect(PURE_PACKAGES).toContain('src/sim/**')
    expect(PURE_LINES).toBeGreaterThanOrEqual(90)
    const out = mkdtempSync(join(tmpdir(), 'btg-cov-'))
    try {
      const r = spawnSync(
        'npx',
        [
          'vitest',
          'run',
          '--project',
          'unit',
          'src/sim/controllers',
          '--coverage',
          '--coverage.include=src/sim/controllers/**',
          '--coverage.exclude=**/*.test.ts',
          '--coverage.reporter=json-summary',
          `--coverage.reportsDirectory=${out}`,
          '--coverage.thresholds.lines=0',
        ],
        { cwd: ROOT, encoding: 'utf8', env: { ...process.env, CI: '', FORCE_COLOR: '0' } },
      )
      expect(r.status, r.stdout + r.stderr).toBe(0)
      const summary = JSON.parse(readFileSync(join(out, 'coverage-summary.json'), 'utf8')) as {
        total: { lines: { pct: number } }
      }
      expect(summary.total.lines.pct).toBeGreaterThanOrEqual(90)
    } finally {
      rmSync(out, { recursive: true, force: true })
    }
  }, 120_000)
})
