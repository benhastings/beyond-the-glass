import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { FIXTURE_EPIC, ROOT, cleanCheckout } from './helpers.ts'

/**
 * Builds a criterion tag at runtime. Fixtures must never contain a literal tag: the tracer scans this
 * file's source too, and would count it as a real test of that criterion (or as an unknown tag).
 */
const tag = (issue: string, n: number) => `${issue}.AC${String(n)}`

// End to end: the real tracer, the real PR-body parser, and JUnit files produced by the real Vitest and
// Playwright configs, all in a scratch checkout of this repository.
describe('E0-10 acceptance-criteria gate', () => {
  let dir: string
  beforeAll(() => {
    dir = cleanCheckout()
    symlinkSync(join(ROOT, 'node_modules'), join(dir, 'node_modules'), 'dir')
    writeFileSync(join(dir, 'docs/plan/epics/E99-fixture.md'), FIXTURE_EPIC)
  })
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  const write = (rel: string, text: string) => {
    mkdirSync(dirname(join(dir, rel)), { recursive: true })
    writeFileSync(join(dir, rel), text)
  }
  const sh = (cmd: string, args: string[], env: Record<string, string> = {}) => {
    const r = spawnSync(cmd, args, {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, FORCE_COLOR: '0', ...env },
    })
    return { code: r.status, out: r.stdout + r.stderr }
  }
  const trace = (...args: string[]) => sh('python3', ['scripts/ac-trace.py', ...args])

  it('[E0-10.AC1] a PR that closes an issue with untraced criteria fails, listing the missing tags', () => {
    const ids = sh('python3', ['scripts/pr-issues.py'], {
      PR_BODY: 'Adds the thing.\n\nCloses #15\nRefs #2',
    })
    expect(ids.out.trim()).toBe('E0-02') // #15 is E0-02; #2 is the E0 epic and is ignored
    rmSync(join(dir, 'docs/evidence/E0-02.md'), { force: true })
    rmSync(join(dir, 'tests/repo/ci.test.ts'), { force: true })
    const r = trace('--issue', 'E0-02')
    expect(r.code).toBe(1)
    expect(r.out).toMatch(/UNTRACED \(3\)/)
    for (const tag of ['E0-02.AC1', 'E0-02.AC2', 'E0-02.AC3']) expect(r.out).toContain(tag)
  })

  it('[E0-10.AC1] the CI gate traces the issues from the PR body against this run’s JUnit results', () => {
    const ci = parse(readFileSync(join(ROOT, '.github/workflows/ci.yml'), 'utf8')) as {
      on: { pull_request: { types: string[] } }
      jobs: Record<
        string,
        {
          name?: string
          needs?: string[]
          if?: string
          steps: { run?: string; env?: Record<string, string> }[]
        }
      >
    }
    expect(ci.on.pull_request.types).toContain('edited')
    const gate = ci.jobs.gate
    expect(gate?.name).toBe('gate')
    expect(gate?.needs).toEqual(['verify', 'e2e'])
    expect(gate?.if).toBe('always()')
    const runs = gate?.steps.map((s) => s.run ?? '') ?? []
    expect(gate?.steps.find((s) => s.run?.includes('pr-issues.py'))?.env?.PR_BODY).toBe(
      '${{ github.event.pull_request.body }}',
    )
    expect(
      runs.some((r) =>
        /ac-trace\.py --issue \$\{\{ steps\.ids\.outputs\.ids \}\} --junit reports\/\*\.xml/.test(
          r,
        ),
      ),
    ).toBe(true)
  })

  it('[E0-10.AC2] a tag that matches no criterion fails, even when the PR closes nothing', () => {
    write(
      'src/sim/core/typo.test.ts',
      `import { it } from 'vitest'\nit('[${tag('E0-01', 9)}] typo', () => {})\n`,
    )
    write(
      'e2e/typo.spec.ts',
      `import { acTest } from './ac.ts'\nacTest('${tag('E98-01', 1)}', 'stale', () => {})\n`,
    )
    const r = trace()
    expect(r.code).toBe(1)
    expect(r.out).toContain('E0-01.AC9 (in src/sim/core/typo.test.ts:2)')
    expect(r.out).toContain('E98-01.AC1 (in e2e/typo.spec.ts:2)')
    rmSync(join(dir, 'src/sim/core/typo.test.ts'))
    rmSync(join(dir, 'e2e/typo.spec.ts'))
  })

  it('[E0-10.AC3] with real Vitest JUnit, only tagged tests that ran and passed count', () => {
    // E99-01's four automated criteria: AC1 passes, AC2 fails, AC3 is skipped in source, AC4 isn't in this run.
    write(
      'src/sim/core/gate.test.ts',
      [
        "import { expect, it } from 'vitest'",
        "import { acTest } from '../../test/ac'",
        `acTest('${tag('E99-01', 1)}', 'passes', () => { expect(1).toBe(1) })`,
        `it('[${tag('E99-01', 2)}] fails', () => { expect(1).toBe(2) })`,
        `it.skip('[${tag('E99-01', 3)}] skipped', () => {})`,
        '',
      ].join('\n'),
    )
    const run = sh('npx', ['vitest', 'run', '--project', 'unit', 'src/sim/core/gate.test.ts'], {
      CI: '1',
    })
    expect(run.code, run.out).toBe(1) // the deliberate failure
    const junit = readFileSync(join(dir, 'reports/vitest.xml'), 'utf8')
    expect(junit).toContain(`[${tag('E99-01', 1)}] passes`)

    const r = trace('--issue', 'E99-01', '--junit', 'reports/vitest.xml')
    expect(r.code).toBe(1)
    const line = (tag: string) => r.out.split('\n').find((l) => l.includes(tag)) ?? '<not listed>'
    expect(r.out).toMatch(/UNTRACED \(4\)/)
    expect(r.out).not.toMatch(/E99-01\.AC1 /)
    expect(line('E99-01.AC2')).toMatch(/failed in this run/)
    expect(line('E99-01.AC3')).toMatch(/skipped/)
    expect(line('E99-01.AC4')).toMatch(/needs a test/)
    rmSync(join(dir, 'src/sim/core/gate.test.ts'))
    rmSync(join(dir, 'reports'), { recursive: true, force: true })
  }, 60_000)

  it('[E0-10.AC4] a manual criterion is traced only by a non-empty evidence entry under its heading', () => {
    write(
      'docs/evidence/E0-02.md',
      '# E0-02\n\n## E0-02.AC1\n<!-- to do -->\n\n## E0-02.AC2\nRan it: https://example.com/run/1\n',
    )
    const r = trace('--issue', 'E0-02')
    const line = (tag: string) => r.out.split('\n').find((l) => l.includes(tag)) ?? '<not listed>'
    expect(line('E0-02.AC1')).toMatch(/evidence heading present but empty/)
    expect(r.out).not.toMatch(/E0-02\.AC2 /)
    write('docs/evidence/E0-02.md', '# E0-02\n\nE0-02.AC1 is mentioned, but not as a heading.\n')
    expect(trace('--issue', 'E0-02').out).toMatch(
      /E0-02\.AC1 +needs evidence in docs\/evidence\/E0-02\.md/,
    )
  })

  it('[E0-10.AC5] the tracer’s own unit tests run in CI on every PR', () => {
    const ci = parse(readFileSync(join(ROOT, '.github/workflows/ci.yml'), 'utf8')) as {
      on: { pull_request: { paths?: string[] } }
      jobs: Record<string, { steps: { run?: string }[] }>
    }
    expect(ci.on.pull_request.paths).toBeUndefined()
    expect(
      ci.jobs.gate?.steps.some((s) => s.run === 'python3 -m unittest discover scripts/tests -v'),
    ).toBe(true)
    const r = spawnSync('python3', ['-m', 'unittest', 'discover', 'scripts/tests'], {
      cwd: ROOT,
      encoding: 'utf8',
    })
    expect(r.status, r.stderr).toBe(0)
    expect(r.stderr).toMatch(/Ran \d+ tests/)
  })

  it('[E0-10.AC6] the matrix shows per-milestone and per-epic percentages, and the committed copy is current', () => {
    const out = join(dir, 'fresh-matrix.md')
    const r = spawnSync('python3', ['scripts/ac-trace.py', '--report', out], {
      cwd: ROOT,
      encoding: 'utf8',
    })
    expect(r.status, r.stdout).toBe(0)
    const fresh = readFileSync(out, 'utf8')
    expect(fresh).toMatch(/^\| Milestone \| Traced \| Total \| % \|$/m)
    expect(fresh).toMatch(/^\| M0 · Foundations \| \d+ \| \d+ \| \d+% \|$/m)
    expect(fresh).toMatch(/^\| Epic \| Traced \| Total \| % \|$/m)
    expect(fresh).toMatch(/^\| E0 · Foundations & agent guardrails \| \d+ \| \d+ \| \d+% \|$/m)
    expect(readFileSync(join(ROOT, 'docs/plan/AC-TRACEABILITY.md'), 'utf8')).toBe(
      fresh.replace(/^\d+\/\d+ criteria traced.*\n/, ''),
    )
  })
})
