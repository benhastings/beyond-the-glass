import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { GLOBAL_LINES, PURE_LINES } from '../../vitest.config.ts'
import { ROOT, cleanCheckout } from './helpers.ts'

/** Ten statements; a test that calls it with `covered` true or false exercises roughly 80% of them. */
const tenLines = `export function f(covered: boolean): number {
  let n = 0
  n += 1
  n += 1
  n += 1
  n += 1
  if (covered) return n
  n += 1
  n += 1
  return n
}
`
const callsHalf = (mod: string) =>
  `import { expect, it } from 'vitest'\nimport { f } from './${mod}'\nit('x', () => { expect(f(true)).toBe(4) })\n`

describe('E0-05 test harness', () => {
  let dir: string
  beforeAll(() => {
    dir = cleanCheckout()
    symlinkSync(join(ROOT, 'node_modules'), join(dir, 'node_modules'), 'dir')
  })
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  const write = (rel: string, text: string) => {
    mkdirSync(dirname(join(dir, rel)), { recursive: true })
    writeFileSync(join(dir, rel), text)
  }
  const coverage = () => {
    const r = spawnSync(
      'npx',
      ['vitest', 'run', '--coverage', '--project', 'unit', '--project', 'dom'],
      {
        cwd: dir,
        encoding: 'utf8',
        env: { ...process.env, CI: '1', FORCE_COLOR: '0' },
      },
    )
    return { code: r.status, out: r.stdout + r.stderr }
  }
  const reset = () => {
    rmSync(join(dir, 'src/sim/core/partial.ts'), { force: true })
    rmSync(join(dir, 'src/sim/core/partial.test.ts'), { force: true })
    rmSync(join(dir, 'src/app/partial.ts'), { force: true })
    rmSync(join(dir, 'src/app/partial.test.ts'), { force: true })
    rmSync(join(dir, 'src/app/untested.ts'), { force: true })
  }

  it('[E0-05.AC2] thresholds are 90% lines for pure packages and 70% overall', () => {
    expect(PURE_LINES).toBeGreaterThanOrEqual(90)
    expect(GLOBAL_LINES).toBeGreaterThanOrEqual(70)
  })

  it('[E0-05.AC2] the coverage gate fails when src/sim drops below 90% lines', () => {
    reset()
    write('src/sim/core/partial.ts', tenLines)
    write('src/sim/core/partial.test.ts', callsHalf('partial'))
    const { code, out } = coverage()
    expect(code, out).not.toBe(0)
    expect(out).toMatch(/does not meet "src\/sim\/\*\*" threshold \(90%\)/)
  }, 60_000)

  it('[E0-05.AC2] the same coverage in src/app passes, because the 90% bar is only for pure packages', () => {
    reset()
    write('src/app/partial.ts', tenLines)
    write('src/app/partial.test.ts', callsHalf('partial'))
    const { code, out } = coverage()
    expect(code, out).toBe(0)
  }, 60_000)

  it('[E0-05.AC2] the coverage gate fails when overall coverage drops below 70% lines', () => {
    reset()
    write(
      'src/app/untested.ts',
      tenLines
        .replaceAll('n += 1', 'n += 2')
        .repeat(1)
        .replace('export function f', 'export function g'),
    )
    write('src/app/partial.ts', tenLines)
    write('src/app/partial.test.ts', callsHalf('partial'))
    const { code, out } = coverage()
    expect(code, out).not.toBe(0)
    expect(out).toMatch(/does not meet global threshold \(70%\)/)
  }, 60_000)

  describe('CI wiring', () => {
    interface Step {
      run?: string
      uses?: string
      if?: string
      with?: { path?: string }
    }
    const ci = parse(readFileSync(join(ROOT, '.github/workflows/ci.yml'), 'utf8')) as {
      jobs: Record<string, { steps: Step[] }>
    }
    const steps = Object.values(ci.jobs).flatMap((j) => j.steps)

    it('[E0-05.AC1] CI runs npm test with coverage and npm run test:e2e', () => {
      expect(steps.some((s) => s.run?.startsWith('npm run test:coverage'))).toBe(true)
      expect(steps.some((s) => s.run?.startsWith('npm run test:e2e'))).toBe(true)
    })

    it('[E0-05.AC4] CI uploads Playwright traces and screenshots when e2e fails', () => {
      const upload = steps.find(
        (s) =>
          s.uses?.startsWith('actions/upload-artifact') && s.with?.path?.includes('test-results'),
      )
      expect(upload, 'an upload-artifact step for test-results/').toBeDefined()
      expect(upload?.if).toMatch(/failure\(\)/)
    })
  })
})
