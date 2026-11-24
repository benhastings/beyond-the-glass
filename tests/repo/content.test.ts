import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { build } from 'vite'
import { afterAll, describe, expect, it } from 'vitest'
import { contentPlugin } from '../../src/content/build/vite-plugin.ts'
import { ROOT } from './helpers.ts'

const dirs: string[] = []
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true })
})

/** Builds a throwaway app that imports `virtual:btg-content`, over a copy of the fixture content. */
async function buildWith(edit?: (contentDir: string) => void) {
  const dir = mkdtempSync(join(tmpdir(), 'btg-content-build-'))
  dirs.push(dir)
  cpSync(join(ROOT, 'content/__fixtures__/valid'), join(dir, 'content'), { recursive: true })
  cpSync(join(ROOT, 'src/scenarios/ravenpost.yaml'), join(dir, 'src/scenarios/ravenpost.yaml'))
  writeFileSync(
    join(dir, 'main.js'),
    "import m from 'virtual:btg-content'\nconsole.log(m.regions.length)\n",
  )
  edit?.(join(dir, 'content'))
  return build({
    root: dir,
    configFile: false,
    logLevel: 'silent',
    plugins: [contentPlugin()],
    build: { write: false, rolldownOptions: { input: join(dir, 'main.js') } },
  })
}

const outputs = (out: Awaited<ReturnType<typeof build>>) =>
  (Array.isArray(out) ? out : [out]).flatMap((o) => ('output' in o ? o.output : []))

describe('E5-01 content build step', () => {
  it('[E5-01.AC1] broken references fail `vite build`, naming the file and field', async () => {
    const lesson = 'regions/alpha/basics/second-steps.mdx'
    await expect(
      buildWith((c) => {
        const f = join(c, lesson)
        writeFileSync(
          f,
          readFileSync(f, 'utf8').replace(
            'prerequisites: [first-steps]',
            'prerequisites: [no-such-lesson]',
          ),
        )
      }),
    ).rejects.toThrow(/second-steps\.mdx:\d+:\d+ prerequisites\.0: unknown lesson "no-such-lesson"/)
  }, 60_000)

  it('[E5-01.AC2] a prerequisite cycle fails `vite build`', async () => {
    await expect(
      buildWith((c) => {
        const f = join(c, 'regions/alpha/basics/first-steps.mdx')
        writeFileSync(
          f,
          readFileSync(f, 'utf8').replace(
            'scenario: ravenpost',
            'scenario: ravenpost\nprerequisites: [second-steps]',
          ),
        )
      }),
    ).rejects.toThrow(
      /prerequisite cycle: .*first-steps.*second-steps|prerequisite cycle: .*second-steps.*first-steps/,
    )
  }, 60_000)

  it('[E5-01.AC3] the build emits a manifest.json with region and module estimates', async () => {
    const files = outputs(await buildWith())
    const asset = files.find((f) => f.fileName === 'content/manifest.json')
    expect(asset).toBeDefined()
    const manifest = JSON.parse(String(asset && 'source' in asset ? asset.source : '')) as {
      regions: { id: string; estimatedMinutes: number; modules: { estimatedMinutes: number }[] }[]
    }
    expect(
      manifest.regions.map((r) => [
        r.id,
        r.estimatedMinutes,
        r.modules.map((m) => m.estimatedMinutes),
      ]),
    ).toEqual([
      ['alpha', 20, [20]],
      ['beta', 15, [15]],
    ])
  }, 60_000)

  it('[E5-01.AC1] content is validated even when nothing imports the manifest', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'btg-content-noimport-'))
    dirs.push(dir)
    cpSync(join(ROOT, 'content/__fixtures__/valid'), join(dir, 'content'), { recursive: true })
    writeFileSync(join(dir, 'content/regions/beta/region.yaml'), 'id: beta\n')
    writeFileSync(join(dir, 'main.js'), 'console.log(1)\n')
    await expect(
      build({
        root: dir,
        configFile: false,
        logLevel: 'silent',
        plugins: [contentPlugin()],
        build: { write: false, rolldownOptions: { input: join(dir, 'main.js') } },
      }),
    ).rejects.toThrow(/regions\/beta\/region\.yaml:\d+:\d+/)
  }, 60_000)

  it('[E5-01.AC1] the app build uses the content plugin', () => {
    expect(readFileSync(join(ROOT, 'vite.config.ts'), 'utf8')).toMatch(
      /plugins: \[[^\]]*contentPlugin\(\)/,
    )
  })
})
