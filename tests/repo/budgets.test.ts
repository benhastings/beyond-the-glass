import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { parse } from 'yaml'
// @ts-expect-error -- plain ESM script without type declarations
import * as budgetsLib from '../../scripts/budgets.mjs'
import { ROOT, cleanCheckout } from './helpers.ts'

const { initialJs, scoreFailures } = budgetsLib as {
  initialJs: (dist: string) => { files: { file: string; gzipBytes: number }[]; gzipKb: number }
  scoreFailures: (scores: Record<string, number>, min: Record<string, number>) => string[]
}
interface Budgets {
  initialJsGzipKb: number
  lighthouse: { routes: string[]; minScores: Record<string, number> }
  simCommandMs: number
  panelRender6hMs: number
}
const budgets = JSON.parse(readFileSync(join(ROOT, 'budgets.json'), 'utf8')) as Budgets

describe('E0-08 budgets', () => {
  describe('[E0-08.AC2] initial JS', () => {
    let dir = ''
    beforeAll(() => {
      dir = cleanCheckout()
      symlinkSync(join(ROOT, 'node_modules'), join(dir, 'node_modules'), 'dir')
      const b = spawnSync('npx', ['vite', 'build', '--logLevel', 'error'], {
        cwd: dir,
        encoding: 'utf8',
      })
      expect(b.status, b.stderr).toBe(0)
    }, 120_000)
    afterAll(() => {
      rmSync(dir, { recursive: true, force: true })
    })
    const check = () => {
      const r = spawnSync('node', ['scripts/check-bundle.mjs'], { cwd: dir, encoding: 'utf8' })
      return { code: r.status, out: r.stdout + r.stderr }
    }

    it('[E0-08.AC2] [E11-02.AC3] the real build is within budget', () => {
      const r = check()
      expect(r.code, r.out).toBe(0)
      expect(r.out).toMatch(/initial JS: [\d.]+ KB gzipped \(budget 250 KB\)/)
    })

    it('[E0-08.AC2] the same build fails once it exceeds the budget', () => {
      const kb = initialJs(join(dir, 'dist')).gzipKb
      const tight = { ...budgets, initialJsGzipKb: Math.floor(kb) - 1 }
      writeFileSync(join(dir, 'budgets.json'), JSON.stringify(tight))
      const r = check()
      expect(r.code, r.out).toBe(1)
      expect(r.out).toMatch(/over the \d+ KB budget/)
      writeFileSync(join(dir, 'budgets.json'), JSON.stringify(budgets))
    })

    it('[E0-08.AC2] counts module scripts and modulepreloads, not lazy chunks', () => {
      const d = mkdtempSync(join(tmpdir(), 'btg-dist-'))
      mkdirSync(join(d, 'assets'))
      writeFileSync(join(d, 'assets/entry.js'), 'a'.repeat(1000))
      writeFileSync(join(d, 'assets/vendor.js'), 'b'.repeat(1000))
      writeFileSync(join(d, 'assets/lazy.js'), 'c'.repeat(1000))
      writeFileSync(
        join(d, 'index.html'),
        '<script type="module" crossorigin src="./assets/entry.js"></script><link rel="modulepreload" crossorigin href="./assets/vendor.js">',
      )
      expect(initialJs(d).files.map((f) => f.file)).toEqual(['assets/entry.js', 'assets/vendor.js'])
      rmSync(d, { recursive: true, force: true })
    })
  })

  describe('[E0-08.AC1] Lighthouse thresholds', () => {
    const min = budgets.lighthouse.minScores
    it('[E0-08.AC1] the minimums are Performance 90, Accessibility 100, Best Practices 95', () => {
      expect(min).toEqual({ performance: 90, accessibility: 100, 'best-practices': 95 })
    })
    it.each([
      [{ performance: 89, accessibility: 100, 'best-practices': 100 }, 'performance: 89 < 90'],
      [{ performance: 100, accessibility: 99, 'best-practices': 100 }, 'accessibility: 99 < 100'],
      [{ performance: 100, accessibility: 100, 'best-practices': 94 }, 'best-practices: 94 < 95'],
      [{ performance: 100, accessibility: 100 }, 'best-practices: missing < 95'],
    ])('[E0-08.AC1] fails %o', (scores, message) => {
      expect(scoreFailures(scores as Record<string, number>, min)).toEqual([message])
    })
    it('[E0-08.AC1] passes exactly at the minimums', () => {
      expect(
        scoreFailures({ performance: 90, accessibility: 100, 'best-practices': 95 }, min),
      ).toEqual([])
    })
    it('[E0-08.AC1] CI runs the bundle check after every build', () => {
      const ci = parse(readFileSync(join(ROOT, '.github/workflows/ci.yml'), 'utf8')) as {
        jobs: Record<string, { steps: { run?: string }[] }>
      }
      const runs = ci.jobs.verify?.steps.map((s) => s.run ?? '') ?? []
      const build = runs.findIndex((r) => r === 'npm run build')
      const bundle = runs.findIndex((r) => r.startsWith('node scripts/check-bundle.mjs'))
      expect(build).toBeGreaterThanOrEqual(0)
      expect(bundle).toBeGreaterThan(build)
    })
  })

  describe('[E0-08.AC3] one config file, documented in AGENTS.md', () => {
    const agents = readFileSync(join(ROOT, 'AGENTS.md'), 'utf8')
    const table = /^## 5\. Budgets\n([\s\S]*?)(?=^## )/m.exec(agents)?.[1] ?? ''

    it('[E0-08.AC3] AGENTS.md §5 states the same numbers as budgets.json', () => {
      const m = budgets.lighthouse.minScores
      expect(table).toContain(`| Initial JS (gzipped) | ≤ ${String(budgets.initialJsGzipKb)} KB |`)
      expect(table).toContain(
        `| Lighthouse Performance / Accessibility / Best Practices | ≥ ${String(m.performance)} / ${String(m.accessibility)} / ≥ ${String(m['best-practices'])} |`,
      )
      expect(table).toContain(
        `| Sim command evaluation | < ${String(budgets.simCommandMs)} ms typical |`,
      )
      expect(table).toContain(
        `| Panel render (6 h of data) | < ${String(budgets.panelRender6hMs)} ms |`,
      )
      expect(table).toContain('budgets.json')
    })

    it('[E0-08.AC3] the checks read their limits from budgets.json, not from literals', () => {
      for (const f of [
        'scripts/check-bundle.mjs',
        'scripts/lighthouse.mjs',
        'scripts/budgets.mjs',
      ]) {
        // `* 100` turns Lighthouse's 0–1 score into a percentage; it isn't a budget.
        const src = readFileSync(join(ROOT, f), 'utf8').replaceAll('* 100', '')
        expect(src, f).not.toMatch(/\b(250|90|95|100)\b/)
      }
    })
  })
})
