import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { build } from 'vite'
import { afterAll, describe, expect, it } from 'vitest'
import { thresholdPlugin } from '../../src/content/build/threshold-plugin.ts'
import { ROOT } from './helpers.ts'

const dirs: string[] = []
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true })
})

const buildWith = (edit?: (text: string) => string) => {
  const dir = mkdtempSync(join(tmpdir(), 'btg-threshold-'))
  dirs.push(dir)
  cpSync(join(ROOT, 'content/threshold'), join(dir, 'content/threshold'), { recursive: true })
  const file = join(dir, 'content/threshold/bank.yaml')
  if (edit) writeFileSync(file, edit(readFileSync(file, 'utf8')))
  writeFileSync(join(dir, 'main.js'), 'console.log(1)\n')
  return build({
    root: dir,
    configFile: false,
    logLevel: 'silent',
    plugins: [thresholdPlugin()],
    build: { write: false, rolldownOptions: { input: join(dir, 'main.js') } },
  })
}

describe('E4-01 build-time validation', () => {
  it('[E4-01.AC1] the build validates the bank and fails on an invalid one', async () => {
    await expect(buildWith()).resolves.toBeDefined()
    await expect(buildWith((t) => t.replace('version: 1', 'version: 2'))).rejects.toThrow(
      /Invalid question bank:\n {2}content\/threshold\/bank\.yaml version/,
    )
    expect(readFileSync(join(ROOT, 'vite.config.ts'), 'utf8')).toMatch(/thresholdPlugin\(\)/)
  })
})
