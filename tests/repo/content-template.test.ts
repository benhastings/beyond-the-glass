import { compile } from '@mdx-js/mdx'
import { execFileSync } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import remarkFrontmatter from 'remark-frontmatter'
import { parse as parseYaml } from 'yaml'
import { afterAll, describe, expect, it } from 'vitest'
import { buildManifest, scenarioIdsIn } from '../../src/content/build/load.ts'
import { remarkDiagram } from '../../src/content/build/remark-diagram.ts'
import { lintMdx, lintYaml } from '../../src/content/lint/rules.ts'
import { challengeSchema } from '../../src/sim/challenges/schema.ts'
import { ROOT } from './helpers.ts'

const TEMPLATE = join(ROOT, 'content/_template')
const tmp: string[] = []
afterAll(() => {
  for (const d of tmp) rmSync(d, { recursive: true, force: true })
})

describe('E5-06 content template', () => {
  it('[E5-06.AC2] the template lesson builds, compiles and passes the style lint unmodified', async () => {
    // As an author would use it: the module copied into a region, the challenge registered.
    const root = mkdtempSync(join(tmpdir(), 'btg-template-'))
    tmp.push(root)
    cpSync(join(ROOT, 'content/glossary.yaml'), join(root, 'glossary.yaml'))
    cpSync(join(TEMPLATE, 'module-template'), join(root, 'regions/somewhere/module-template'), {
      recursive: true,
    })
    writeFileSync(
      join(root, 'regions/somewhere/region.yaml'),
      'id: somewhere\ntitle: Somewhere\norder: 0\nsummary: s\n',
    )
    const challenge = challengeSchema.parse(
      parseYaml(readFileSync(join(TEMPLATE, 'challenge-template.yaml'), 'utf8')),
    )
    const { manifest, warnings } = buildManifest(root, {
      scenarioIds: scenarioIdsIn(join(ROOT, 'src/scenarios')),
      challengeIds: [...scenarioIdsIn(join(ROOT, 'src/challenges')), challenge.id],
    })
    const lesson = manifest.regions[0]?.modules[0]?.lessons[0]
    expect(lesson).toMatchObject({
      id: 'lesson-template',
      steps: [{ id: 'where-you-are' }, { id: 'look' }, { id: 'check' }],
      challenges: [{ id: 'challenge-template', required: true }],
    })
    expect(lesson?.checks.map((c) => [c.id, c.required])).toEqual([
      ['template-what-restarts', true],
    ])
    expect(warnings).toEqual([])
    const mdxFile = join(TEMPLATE, 'module-template/lesson-template.mdx')
    await expect(
      compile(
        { value: readFileSync(mdxFile, 'utf8'), path: mdxFile },
        { remarkPlugins: [remarkFrontmatter, remarkDiagram] },
      ),
    ).resolves.toBeDefined()
    const lint = [
      ...lintMdx('lesson-template.mdx', readFileSync(mdxFile, 'utf8')),
      ...lintYaml(
        'checks',
        readFileSync(join(TEMPLATE, 'module-template/lesson-template.checks.yaml'), 'utf8'),
      ),
      ...lintYaml('challenge', readFileSync(join(TEMPLATE, 'challenge-template.yaml'), 'utf8')),
    ]
    expect(lint).toEqual([])
  })

  it('[E5-06.AC1] lint:content passes on the course content and fails on a violation', () => {
    expect(
      execFileSync('node', ['scripts/lint-content.mjs'], { cwd: ROOT, encoding: 'utf8' }),
    ).toMatch(/0 problem\(s\)/)
    const dir = mkdtempSync(join(ROOT, 'node_modules/.tmp-lint-'))
    tmp.push(dir)
    writeFileSync(
      join(dir, 'bad.mdx'),
      '---\nid: x\nobjectives: [o]\n---\n\nThis is simply a test.\n',
    )
    let out = ''
    try {
      execFileSync('node', ['scripts/lint-content.mjs', dir.replace(`${ROOT}/`, '')], {
        cwd: ROOT,
        encoding: 'utf8',
        stdio: 'pipe',
      })
    } catch (e) {
      out = String((e as { stderr?: string }).stderr)
    }
    expect(out).toMatch(/bad\.mdx:6 banned-word: “simply”/)
    // And CI runs it.
    expect(readFileSync(join(ROOT, '.github/workflows/ci.yml'), 'utf8')).toMatch(
      /run: npm run lint:content/,
    )
  })
})
