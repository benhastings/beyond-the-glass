import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ESLint } from 'eslint'
import tseslint from 'typescript-eslint'
import { build } from 'vite'
import { afterAll, describe, expect, it } from 'vitest'
import { scenarioPlugin } from '../../src/scenarios/vite-plugin.ts'
import { ROOT } from './helpers.ts'

const GOOD = readFileSync(join(ROOT, 'src/scenarios/ravenpost.yaml'), 'utf8')

/** Builds a throwaway app whose only module imports `src/scenarios/<name>.yaml`. */
async function buildWith(yaml: string) {
  const dir = mkdtempSync(join(tmpdir(), 'btg-scenario-'))
  dirs.push(dir)
  mkdirSync(join(dir, 'src/scenarios'), { recursive: true })
  writeFileSync(join(dir, 'src/scenarios/test.yaml'), yaml)
  writeFileSync(
    join(dir, 'src/main.js'),
    "import s from './scenarios/test.yaml'\nconsole.log(s.id)\n",
  )
  return build({
    root: dir,
    configFile: false,
    logLevel: 'silent',
    plugins: [scenarioPlugin()],
    build: { write: false, rolldownOptions: { input: join(dir, 'src/main.js') } },
  })
}
const dirs: string[] = []
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true })
})

describe('E6-01 scenario build step', () => {
  it('[E6-01.AC3] an invalid scenario fails `vite build` with file:line errors', async () => {
    const bad = GOOD.replace('replicas: 3', 'replicas: -3')
    const line = GOOD.split('\n').findIndex((l) => l.includes('replicas: 3')) + 1
    await expect(buildWith(bad)).rejects.toThrow(
      new RegExp(`test\\.yaml:${String(line)}:\\d+ clusters\\.0\\.resources\\.4\\.spec\\.replicas`),
    )
  }, 60_000)

  it('[E6-01.AC3] a valid scenario builds to a JSON module', async () => {
    const out = await buildWith(GOOD)
    const chunks = (Array.isArray(out) ? out : [out]).flatMap((o) =>
      'output' in o ? o.output : [],
    )
    const code = chunks.map((c) => ('code' in c ? c.code : '')).join('')
    expect(code).toMatch(/id:\s*[`"']ravenpost[`"']/)
    expect(code).not.toContain('not-a-real-password')
  }, 60_000)

  it('[E6-01.AC3] the app build uses the scenario plugin', () => {
    const config = readFileSync(join(ROOT, 'vite.config.ts'), 'utf8')
    expect(config).toMatch(/plugins: \[[^\]]*scenarioPlugin\(\)/)
  })
})

describe('E6-01 framework-free simulator', () => {
  // A type-aware lint of all of src/sim: it grows with the simulator, and shares the machine in CI.
  it('[E6-01.AC1] no file in src/sim imports React or the DOM, or reads the real clock or Math.random', async () => {
    const eslint = new ESLint({ cwd: ROOT })
    const results = await eslint.lintFiles(['src/sim/**/*.ts'])
    expect(results.length).toBeGreaterThan(10)
    const boundary = results.flatMap((r) =>
      r.messages
        .filter((m) =>
          [
            'no-restricted-imports',
            'no-restricted-globals',
            'no-restricted-properties',
            'no-restricted-syntax',
          ].includes(m.ruleId ?? ''),
        )
        .map((m) => `${r.filePath}:${String(m.line)} ${m.message}`),
    )
    expect(boundary).toEqual([])
  }, 180_000)

  it('[E6-01.AC1] the determinism rule rejects Math.random, Date.now and new Date() in src/sim', async () => {
    const eslint = new ESLint({ cwd: ROOT, overrideConfig: tseslint.configs.disableTypeChecked })
    for (const code of [
      'export const r = Math.random()\n',
      'export const t = Date.now()\n',
      'export const d = new Date()\n',
    ]) {
      const [result] = await eslint.lintText(code, {
        filePath: join(ROOT, 'src/sim/core/fixture.ts'),
      })
      expect(
        result?.messages.filter(
          (m) => m.ruleId === 'no-restricted-properties' || m.ruleId === 'no-restricted-syntax',
        ),
      ).not.toHaveLength(0)
    }
  }, 60_000)
})
