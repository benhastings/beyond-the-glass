import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { acTest } from '@/test/ac'
import { glossaryFile, lessonFrontMatter, moduleFile, regionFile } from '../schema'
import { buildManifest, ContentError, scenarioIdsIn, type ContentIssue } from './load'

const FIXTURES = join(process.cwd(), 'content/__fixtures__/valid')
const opts = { scenarioIds: ['ravenpost'] }
const tmp: string[] = []
afterAll(() => {
  for (const d of tmp) rmSync(d, { recursive: true, force: true })
})

/** A copy of the valid fixtures with `edits` applied (path → new text, or a function of the old text). */
function variant(edits: Record<string, string | ((old: string) => string)>): string {
  const dir = mkdtempSync(join(tmpdir(), 'btg-content-'))
  tmp.push(dir)
  cpSync(FIXTURES, dir, { recursive: true })
  for (const [path, edit] of Object.entries(edits)) {
    const file = join(dir, path)
    let old = ''
    try {
      old = readFileSync(file, 'utf8')
    } catch {
      // new file
    }
    writeFileSync(file, typeof edit === 'string' ? edit : edit(old))
  }
  return dir
}

function issuesOf(root: string): ContentIssue[] {
  try {
    buildManifest(root, opts)
  } catch (e) {
    expect(e).toBeInstanceOf(ContentError)
    return (e as ContentError).issues
  }
  throw new Error('expected a ContentError')
}

const lineOf = (root: string, file: string, needle: string) =>
  readFileSync(join(root, file), 'utf8')
    .split('\n')
    .findIndex((l) => l.includes(needle)) + 1

const FIRST = 'regions/alpha/basics/first-steps.mdx'
const SECOND = 'regions/alpha/basics/second-steps.mdx'
const WATCH = 'regions/beta/night/watch.mdx'

describe('buildManifest on the fixture content', () => {
  acTest('E5-01.AC4', 'the fixture content builds into the expected manifest', () => {
    const { manifest, files } = buildManifest(FIXTURES, opts)
    expect(manifest.regions.map((r) => [r.id, r.mood])).toEqual([
      ['alpha', 'reach'],
      ['beta', 'stormwatch'],
    ])
    const [first, second] = manifest.regions[0]?.modules[0]?.lessons ?? []
    expect(first).toEqual({
      id: 'first-steps',
      title: 'First steps',
      objectives: ['List the pods in a namespace'],
      estimatedMinutes: 12,
      domain: 'kubernetes',
      level: 'wayfarer',
      prerequisites: [],
      scenario: 'ravenpost',
      terms: ['container', 'pod'],
      regionId: 'alpha',
      moduleId: 'basics',
      steps: [{ id: 'look', title: 'Take a look' }, { id: 'wrap-up' }],
      file: FIRST,
    })
    expect(second).toMatchObject({
      id: 'second-steps',
      prerequisites: ['first-steps'],
      steps: [],
      terms: [],
    })
    expect(second && 'scenario' in second).toBe(false)
    expect(manifest.glossary.map((t) => t.id)).toEqual(['pod', 'container'])
    expect(manifest.glossary[1]).toEqual({
      id: 'container',
      term: 'Container',
      aliases: [],
      related: [],
      eli5: 'A program packed with everything it needs to run.',
      operator: 'A process isolated with namespaces and cgroups, started from an image.',
    })
    // Underscore drafts are skipped; every real file was read (for watching).
    expect(files.some((f) => /(^|[\\/])_/.test(relative(FIXTURES, f)))).toBe(false)
    // glossary + 2 regions + 2 modules + 3 lessons
    expect(files).toHaveLength(8)
  })

  acTest('E5-01.AC4', 'the fixtures set and omit every optional field at least once', () => {
    const { manifest } = buildManifest(FIXTURES, opts)
    const read = (f: string) => readFileSync(join(FIXTURES, f), 'utf8')
    const lessonsText = [FIRST, SECOND, WATCH].map(read)
    const optional = (
      shape: Record<string, { safeParse: (v: undefined) => { success: boolean } }>,
    ) =>
      Object.entries(shape)
        .filter(([, s]) => s.safeParse(undefined).success)
        .map(([k]) => k)
    for (const key of optional(lessonFrontMatter.shape)) {
      expect(
        lessonsText.some((t) => new RegExp(`^${key}:`, 'm').test(t)),
        `some lesson sets ${key}`,
      ).toBe(true)
      expect(
        lessonsText.some((t) => !new RegExp(`^${key}:`, 'm').test(t)),
        `some lesson omits ${key}`,
      ).toBe(true)
    }
    const regionsText = ['regions/alpha/region.yaml', 'regions/beta/region.yaml'].map(read)
    for (const key of optional(regionFile.shape)) {
      expect(regionsText.some((t) => t.includes(`${key}:`))).toBe(true)
      expect(regionsText.some((t) => !t.includes(`${key}:`))).toBe(true)
    }
    expect(optional(moduleFile.shape)).toEqual([])
    const entries = glossaryFile.shape.terms.unwrap().element.shape
    const terms = manifest.glossary
    const raw = read('glossary.yaml')
    for (const key of optional(entries)) {
      expect(raw.includes(`${key}:`), `some term sets ${key}`).toBe(true)
      expect(terms.length).toBeGreaterThan(raw.split(`${key}:`).length - 1)
    }
    // Body references of every kind are present.
    expect(lessonsText.join('\n')).toMatch(/<Step id="[^"]+" title=/)
    expect(lessonsText.join('\n')).toMatch(/<Term id=/)
    expect(lessonsText.join('\n')).toMatch(/<Terminal scenario=/)
  })

  acTest('E5-01.AC3', 'modules and regions carry the sum of their lessons’ estimates', () => {
    const { manifest } = buildManifest(FIXTURES, opts)
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
  })

  it('builds an empty manifest from an empty root', () => {
    const dir = mkdtempSync(join(tmpdir(), 'btg-empty-'))
    tmp.push(dir)
    expect(buildManifest(dir, opts).manifest).toEqual({ regions: [], glossary: [] })
  })
})

describe('buildManifest errors', () => {
  acTest('E5-01.AC1', 'an unknown prerequisite names the file, line and field', () => {
    const root = variant({
      [SECOND]: (t) => t.replace('prerequisites: [first-steps]', 'prerequisites:\n  - first-step'),
    })
    expect(issuesOf(root)).toEqual([
      {
        file: SECOND,
        line: lineOf(root, SECOND, '- first-step'),
        column: 5,
        field: 'prerequisites.0',
        message: 'unknown lesson "first-step"',
      },
    ])
  })

  acTest('E5-01.AC1', 'unknown glossary terms are reported in front matter and in the body', () => {
    const root = variant({
      [FIRST]: (t) =>
        t
          .replace('terms: [container]', 'terms: [containr]')
          .replace('<Term id="pod">', '<Term id="pdo">'),
    })
    const issues = issuesOf(root)
    expect(issues).toEqual([
      expect.objectContaining({
        file: FIRST,
        line: lineOf(root, FIRST, 'terms:'),
        field: 'terms.0',
        message: 'unknown glossary term "containr"',
      }),
      expect.objectContaining({
        file: FIRST,
        line: lineOf(root, FIRST, '<Term id="pdo">'),
        field: '<Term id>',
        message: 'unknown glossary term "pdo"',
      }),
    ])
    expect(new ContentError(issues).message).toMatch(
      new RegExp(
        `${FIRST.replaceAll('.', '\\.')}:\\d+:\\d+ <Term id>: unknown glossary term "pdo"`,
      ),
    )
  })

  acTest('E5-01.AC1', 'unknown scenarios are reported in front matter and in the body', () => {
    const root = variant({
      [FIRST]: (t) =>
        t
          .replace('scenario: ravenpost', 'scenario: ravenpots')
          .replace('<Terminal scenario="ravenpost"', '<Terminal scenario="nope"'),
    })
    expect(issuesOf(root).map((i) => [i.field, i.message])).toEqual([
      ['scenario', 'unknown scenario "ravenpots"'],
      ['<Terminal scenario>', 'unknown scenario "nope"'],
    ])
  })

  acTest('E5-01.AC1', 'broken glossary references are reported', () => {
    const root = variant({
      'glossary.yaml': (t) =>
        t
          .replace('related: [container]', 'related: [kontainer]')
          .replace('introducedIn: first-steps', 'introducedIn: zeroth-steps'),
    })
    expect(issuesOf(root).map((i) => [i.file, i.field, i.message])).toEqual([
      ['glossary.yaml', 'terms.0.related.0', 'unknown glossary term "kontainer"'],
      ['glossary.yaml', 'terms.0.introducedIn', 'unknown lesson "zeroth-steps"'],
    ])
  })

  acTest('E5-01.AC2', 'a prerequisite cycle fails the build and shows the cycle', () => {
    // first-steps → watch → second-steps → first-steps
    const root = variant({
      [FIRST]: (t) =>
        t.replace('scenario: ravenpost', 'scenario: ravenpost\nprerequisites: [watch]'),
      [WATCH]: (t) =>
        t.replace('prerequisites: [first-steps, second-steps]', 'prerequisites: [second-steps]'),
    })
    const issues = issuesOf(root)
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({ field: 'prerequisites' })
    const cycle = issues[0]?.message.replace('prerequisite cycle: ', '').split(' → ') ?? []
    expect(cycle).toHaveLength(4)
    expect(cycle[0]).toBe(cycle.at(-1))
    expect(new Set(cycle)).toEqual(new Set(['first-steps', 'watch', 'second-steps']))
  })

  acTest('E5-01.AC2', 'each distinct cycle is reported once', () => {
    // first-steps → watch → first-steps, and first-steps → watch → second-steps → first-steps
    const root = variant({
      [FIRST]: (t) =>
        t.replace('scenario: ravenpost', 'scenario: ravenpost\nprerequisites: [watch]'),
    })
    const messages = issuesOf(root).map((i) => i.message)
    expect(messages).toHaveLength(2)
    expect(messages.every((m) => m.startsWith('prerequisite cycle: '))).toBe(true)
  })

  acTest('E5-01.AC2', 'a lesson that requires itself is a cycle', () => {
    const root = variant({
      [SECOND]: (t) => t.replace('prerequisites: [first-steps]', 'prerequisites: [second-steps]'),
    })
    expect(issuesOf(root)).toEqual([
      expect.objectContaining({
        file: SECOND,
        message: 'prerequisite cycle: second-steps → second-steps',
      }),
    ])
  })

  it('reports schema errors at the offending line', () => {
    const root = variant({
      [SECOND]: (t) => t.replace('estimatedMinutes: 8', 'estimatedMinutes: eight'),
    })
    expect(issuesOf(root)).toEqual([
      expect.objectContaining({
        file: SECOND,
        line: lineOf(root, SECOND, 'estimatedMinutes'),
        field: 'estimatedMinutes',
      }),
    ])
    const noObjectives = variant({
      [WATCH]: (t) => t.replace(/objectives:\n {2}- .*\n/, 'objectives: []\n'),
    })
    expect(issuesOf(noObjectives)[0]?.message).toBe('a lesson needs at least one objective')
  })

  it('reports YAML syntax errors, missing files and front matter', () => {
    expect(
      issuesOf(variant({ 'regions/beta/region.yaml': 'id: beta\ntitle: [oops\n' }))[0],
    ).toMatchObject({
      file: 'regions/beta/region.yaml',
    })
    expect(issuesOf(variant({ [WATCH]: 'no front matter here' }))[0]).toMatchObject({
      file: WATCH,
      message: 'missing front matter (a --- block at the top)',
    })
    const noRegion = variant({})
    rmSync(join(noRegion, 'regions/beta/region.yaml'))
    expect(issuesOf(noRegion).map((i) => i.message)).toContain('missing region.yaml')
    const noModule = variant({})
    rmSync(join(noModule, 'regions/beta/night/module.yaml'))
    expect(issuesOf(noModule).map((i) => i.message)).toContain('missing module.yaml')
    expect(issuesOf(variant({ 'glossary.yaml': 'terms:\n  - id: Bad Id\n' }))[0]?.file).toBe(
      'glossary.yaml',
    )
  })

  it('requires IDs to match their folder and file names', () => {
    const issues = issuesOf(
      variant({
        'regions/alpha/region.yaml': (t) => t.replace('id: alpha', 'id: alfa'),
        'regions/alpha/basics/module.yaml': (t) => t.replace('id: basics', 'id: basic'),
        [WATCH]: (t) => t.replace('id: watch', 'id: watching'),
      }),
    )
    expect(issues.map((i) => i.message)).toEqual([
      'must match its folder name "basics"',
      'must match its folder name "alpha"',
      'must match its file name "watch.mdx"',
    ])
  })

  it('rejects duplicate orders, lesson IDs and step IDs', () => {
    const root = variant({
      'regions/beta/region.yaml': (t) => t.replace('order: 1', 'order: 0'),
      [SECOND]: (t) => t.replace('order: 1', 'order: 0'),
      'regions/beta/night/copy.mdx': (t) => t,
      [WATCH]: (t) =>
        t.replace(
          '<Step id="only">Across regions.</Step>',
          '<Step id="a">x</Step>\n\n<Step id="a">y</Step>',
        ),
    })
    writeFileSync(
      join(root, 'regions/beta/night/copy.mdx'),
      readFileSync(join(root, SECOND), 'utf8').replace('order: 0', 'order: 5'),
    )
    const messages = issuesOf(root).map((i) => i.message)
    expect(messages).toEqual(
      expect.arrayContaining([
        'region order 0 is already used by regions/alpha/region.yaml',
        'lesson order 0 is already used by regions/alpha/basics/first-steps.mdx',
        'lesson ID "second-steps" is already used by regions/alpha/basics/second-steps.mdx',
        'duplicate step ID "a"',
      ]),
    )
  })

  it('reports every problem at once, sorted by file and line', () => {
    const root = variant({
      [WATCH]: (t) =>
        t.replace('prerequisites: [first-steps, second-steps]', 'prerequisites: [x, y]'),
      [FIRST]: (t) => t.replace('scenario: ravenpost', 'scenario: z'),
    })
    const issues = issuesOf(root)
    expect(issues.map((i) => `${i.file}:${i.field}`)).toEqual([
      `${FIRST}:scenario`,
      `${WATCH}:prerequisites.0`,
      `${WATCH}:prerequisites.1`,
    ])
    expect(new ContentError(issues).message).toMatch(/^Content build failed \(3 problems\):\n/)
    expect(new ContentError(issues.slice(0, 1)).message).toMatch(
      /^Content build failed \(1 problem\):\n/,
    )
  })

  it('finds scenario IDs from the scenario folder by default', () => {
    expect(scenarioIdsIn(join(process.cwd(), 'src/scenarios'))).toContain('ravenpost')
    expect(scenarioIdsIn(join(process.cwd(), 'nowhere'))).toEqual([])
    expect(() => buildManifest(join(process.cwd(), 'content'))).not.toThrow()
  })
})
