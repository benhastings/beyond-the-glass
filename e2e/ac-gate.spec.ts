import { spawnSync } from 'node:child_process'
import { readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { FIXTURE_EPIC, ROOT, cleanCheckout } from '../tests/repo/helpers.ts'
import { expect, test } from './fixtures.ts'

/** Builds a criterion tag at runtime, so this file's source contains no literal tag for the tracer to count. */
const tag = (issue: string, n: number) => `${issue}.AC${String(n)}`

// Lives in the e2e suite because it runs a nested Playwright, which needs installed browsers.
test('[E0-10.AC3] with real Playwright JUnit, a test skipped in one browser but passed in another counts', ({
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'runs a nested Playwright once, in Chromium')
  test.setTimeout(120_000)
  const dir = cleanCheckout()
  try {
    symlinkSync(join(ROOT, 'node_modules'), join(dir, 'node_modules'), 'dir')
    writeFileSync(join(dir, 'docs/plan/epics/E99-fixture.md'), FIXTURE_EPIC)
    writeFileSync(
      join(dir, 'e2e/gate.spec.ts'),
      [
        "import { expect, test } from './fixtures.ts'",
        "import { acTest } from './ac.ts'",
        `acTest('${tag('E99-01', 3)}', 'passes in chromium, skips in firefox', async ({ page, browserName }) => {`,
        "  test.skip(browserName === 'firefox', 'skip in one project')",
        "  await page.setContent('<h1>ok</h1>')",
        "  await expect(page.getByRole('heading')).toHaveText('ok')",
        '})',
        `test.fixme('[${tag('E99-01', 4)}] not written yet', () => {})`,
        '',
      ].join('\n'),
    )
    const sh = (cmd: string, args: string[], env: Record<string, string> = {}) =>
      spawnSync(cmd, args, {
        cwd: dir,
        encoding: 'utf8',
        env: { ...process.env, FORCE_COLOR: '0', ...env },
      })

    const run = sh(
      'npx',
      [
        'playwright',
        'test',
        'e2e/gate.spec.ts',
        '--project',
        'chromium',
        '--project',
        'firefox',
        '--retries',
        '0',
      ],
      { CI: '1', BASE_URL: 'http://127.0.0.1:9/' },
    )
    expect(run.status, run.stdout + run.stderr).toBe(0)
    expect(readFileSync(join(dir, 'reports/playwright.xml'), 'utf8')).toMatch(/<skipped/)

    const trace = sh('python3', [
      'scripts/ac-trace.py',
      '--junit',
      'reports/playwright.xml',
      '--report',
      'm.md',
    ])
    const matrix = readFileSync(join(dir, 'm.md'), 'utf8')
    expect(matrix).toMatch(/`E99-01\.AC3` \| test \| ✅/)
    expect(matrix).toMatch(/`E99-01\.AC4` \| test \| ⬜ \| tagged test is skipped/)
    expect(trace.status, trace.stdout).toBe(0)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
