import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { parse as parseYaml } from 'yaml'
import {
  glossaryFile,
  lessonFrontMatter,
  moduleFile,
  regionFile,
  type GlossaryEntry,
  type LessonEntry,
  type LessonFrontMatter,
  type Manifest,
  type ModuleEntry,
  type ModuleFile,
  type RegionEntry,
  type RegionFile,
  type StepEntry,
} from '../schema.ts'
import { ContentError, YamlSource, type ContentIssue } from './yaml-source.ts'

export interface BuildOptions {
  /** IDs of the scenarios lessons may reference (default: the `id` of every `src/scenarios/*.yaml`). */
  scenarioIds?: readonly string[]
}

export interface BuildResult {
  manifest: Manifest
  /** Every file read, for the dev server to watch. */
  files: string[]
}

interface Ref {
  id: string
  line: number
  column: number
  field: string
}

interface LessonSource {
  file: string
  fm: LessonFrontMatter
  yaml: YamlSource
  steps: (StepEntry & { line: number; column: number })[]
  bodyTerms: Ref[]
  bodyScenarios: Ref[]
}

function withoutOrder<T extends { order: number }>(t: T): Omit<T, 'order'> {
  const copy = { ...t }
  Reflect.deleteProperty(copy, 'order')
  return copy
}

const isDir = (p: string) => existsSync(p) && statSync(p).isDirectory()
const subdirs = (p: string) =>
  readdirSync(p)
    .filter((n) => !n.startsWith('_') && !n.startsWith('.') && isDir(join(p, n)))
    .sort()

/** The `id` of every scenario YAML in `dir` (validated separately by the scenario plugin). */
export function scenarioIdsIn(dir: string): string[] {
  if (!isDir(dir)) return []
  return readdirSync(dir)
    .filter((f) => /\.ya?ml$/.test(f))
    .map((f) => (parseYaml(readFileSync(join(dir, f), 'utf8')) as { id?: unknown } | null)?.id)
    .filter((id): id is string => typeof id === 'string')
}

/** Splits MDX into front matter (YAML) and body, keeping line numbers. */
function splitFrontMatter(
  text: string,
): { yaml: string; yamlLine: number; body: string; bodyLine: number } | undefined {
  const m = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text)
  if (!m) return undefined
  const yaml = m[1] ?? ''
  return { yaml, yamlLine: 1, body: text.slice(m[0].length), bodyLine: m[0].split('\n').length }
}

const TAG = /<(Step|Term|Terminal)\b([^>]*)>/g
const ATTR = /(\w+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g

/** `<Step id title>`, `<Term id>` and `<Terminal scenario>` uses in an MDX body, with positions. */
function scanBody(body: string, firstLine: number) {
  const steps: LessonSource['steps'] = []
  const terms: Ref[] = []
  const scenarios: Ref[] = []
  const lineStarts = [0]
  for (let i = 0; i < body.length; i++) if (body[i] === '\n') lineStarts.push(i + 1)
  const pos = (offset: number) => {
    let line = 0
    while (line + 1 < lineStarts.length && (lineStarts[line + 1] ?? Infinity) <= offset) line++
    return { line: firstLine + line, column: offset - (lineStarts[line] ?? 0) + 1 }
  }
  for (const m of body.matchAll(TAG)) {
    const attrs: Record<string, string> = {}
    for (const a of (m[2] ?? '').matchAll(ATTR)) attrs[a[1] ?? ''] = a[2] ?? a[3] ?? ''
    const at = pos(m.index)
    if (m[1] === 'Step' && attrs.id !== undefined)
      steps.push({ id: attrs.id, ...(attrs.title ? { title: attrs.title } : {}), ...at })
    if (m[1] === 'Term' && attrs.id !== undefined)
      terms.push({ id: attrs.id, ...at, field: '<Term id>' })
    if (m[1] === 'Terminal' && attrs.scenario !== undefined)
      scenarios.push({ id: attrs.scenario, ...at, field: '<Terminal scenario>' })
  }
  return { steps, terms, scenarios }
}

/**
 * Reads, validates and cross-checks everything under `root`, and builds the manifest. Throws a
 * ContentError listing every problem with its file, line and field (E5-01.AC1, AC2).
 */
export function buildManifest(root: string, opts: BuildOptions = {}): BuildResult {
  const issues: ContentIssue[] = []
  const files: string[] = []
  const rel = (p: string) => relative(root, p) || '.'
  const read = (p: string) => {
    files.push(p)
    return readFileSync(p, 'utf8')
  }
  const scenarioIds = new Set(opts.scenarioIds ?? scenarioIdsIn(join(root, '../src/scenarios')))

  // Glossary
  const glossaryPath = join(root, 'glossary.yaml')
  let glossary: GlossaryEntry[] = []
  let glossaryYaml: YamlSource | undefined
  if (existsSync(glossaryPath)) {
    glossaryYaml = new YamlSource(read(glossaryPath), rel(glossaryPath))
    glossary = glossaryYaml.parse(glossaryFile, issues)?.terms ?? []
  }
  const termIds = new Set(glossary.map((t) => t.id))

  // Regions → modules → lessons
  const invalidLessonIds = new Set<string>()
  const regions: {
    file: RegionFile
    yaml: YamlSource
    modules: { file: ModuleFile; yaml: YamlSource; lessons: LessonSource[] }[]
  }[] = []
  const regionsDir = join(root, 'regions')
  for (const regionDir of isDir(regionsDir)
    ? subdirs(regionsDir).map((d) => join(regionsDir, d))
    : []) {
    const regionPath = join(regionDir, 'region.yaml')
    if (!existsSync(regionPath)) {
      issues.push({
        file: rel(regionDir),
        line: 1,
        column: 1,
        field: '',
        message: 'missing region.yaml',
      })
      continue
    }
    const ry = new YamlSource(read(regionPath), rel(regionPath))
    const region = ry.parse(regionFile, issues)
    if (!region) continue
    if (region.id !== regionDir.split(/[\\/]/).pop())
      issues.push(
        ry.issue(['id'], `must match its folder name "${String(regionDir.split(/[\\/]/).pop())}"`),
      )
    const modules: (typeof regions)[number]['modules'] = []
    for (const moduleDir of subdirs(regionDir).map((d) => join(regionDir, d))) {
      const modulePath = join(moduleDir, 'module.yaml')
      if (!existsSync(modulePath)) {
        issues.push({
          file: rel(moduleDir),
          line: 1,
          column: 1,
          field: '',
          message: 'missing module.yaml',
        })
        continue
      }
      const my = new YamlSource(read(modulePath), rel(modulePath))
      const mod = my.parse(moduleFile, issues)
      if (!mod) continue
      const dirName = moduleDir.split(/[\\/]/).pop() ?? ''
      if (mod.id !== dirName)
        issues.push(my.issue(['id'], `must match its folder name "${dirName}"`))
      const lessons: LessonSource[] = []
      for (const name of readdirSync(moduleDir)
        .filter((f) => f.endsWith('.mdx') && !f.startsWith('_'))
        .sort()) {
        const path = join(moduleDir, name)
        const text = read(path)
        const parts = splitFrontMatter(text)
        if (!parts) {
          issues.push({
            file: rel(path),
            line: 1,
            column: 1,
            field: '',
            message: 'missing front matter (a --- block at the top)',
          })
          continue
        }
        const ly = new YamlSource(parts.yaml, rel(path), parts.yamlLine)
        const fm = ly.parse(lessonFrontMatter, issues)
        if (!fm) {
          // Remember an invalid lesson's ID anyway, so lessons that require it don't report it as unknown.
          const id = (ly.data as { id?: unknown } | undefined)?.id
          if (typeof id === 'string') invalidLessonIds.add(id)
          continue
        }
        if (fm.id !== name.replace(/\.mdx$/, ''))
          issues.push(ly.issue(['id'], `must match its file name "${name}"`))
        const body = scanBody(parts.body, parts.bodyLine)
        lessons.push({
          file: rel(path),
          fm,
          yaml: ly,
          steps: body.steps,
          bodyTerms: body.terms,
          bodyScenarios: body.scenarios,
        })
      }
      modules.push({ file: mod, yaml: my, lessons })
    }
    regions.push({ file: region, yaml: ry, modules })
  }

  // Duplicates and ordering
  const dupOrder = <T extends { yaml: YamlSource }>(
    items: T[],
    orderOf: (t: T) => number,
    what: string,
  ) => {
    const seen = new Map<number, T>()
    for (const t of items) {
      const o = orderOf(t)
      const first = seen.get(o)
      if (first)
        issues.push(
          t.yaml.issue(
            ['order'],
            `${what} order ${String(o)} is already used by ${first.yaml.file}`,
          ),
        )
      else seen.set(o, t)
    }
  }
  dupOrder(regions, (r) => r.file.order, 'region')
  for (const r of regions) {
    dupOrder(r.modules, (m) => m.file.order, 'module')
    for (const m of r.modules)
      dupOrder(
        m.lessons.map((l) => ({ ...l, yaml: l.yaml })),
        (l) => l.fm.order,
        'lesson',
      )
  }
  const lessons = regions.flatMap((r) => r.modules.flatMap((m) => m.lessons))
  const byId = new Map<string, LessonSource>()
  for (const l of lessons) {
    const first = byId.get(l.fm.id)
    if (first)
      issues.push(l.yaml.issue(['id'], `lesson ID "${l.fm.id}" is already used by ${first.file}`))
    else byId.set(l.fm.id, l)
    const stepIds = new Set<string>()
    for (const s of l.steps) {
      if (stepIds.has(s.id))
        issues.push({
          file: l.file,
          line: s.line,
          column: s.column,
          field: '<Step id>',
          message: `duplicate step ID "${s.id}"`,
        })
      stepIds.add(s.id)
    }
  }

  // References
  for (const l of lessons) {
    l.fm.prerequisites.forEach((p, i) => {
      if (!byId.has(p) && !invalidLessonIds.has(p))
        issues.push(l.yaml.issue(['prerequisites', i], `unknown lesson "${p}"`))
    })
    l.fm.terms.forEach((t, i) => {
      if (!termIds.has(t)) issues.push(l.yaml.issue(['terms', i], `unknown glossary term "${t}"`))
    })
    if (l.fm.scenario !== undefined && !scenarioIds.has(l.fm.scenario))
      issues.push(l.yaml.issue(['scenario'], `unknown scenario "${l.fm.scenario}"`))
    for (const r of l.bodyTerms)
      if (!termIds.has(r.id))
        issues.push({
          file: l.file,
          line: r.line,
          column: r.column,
          field: r.field,
          message: `unknown glossary term "${r.id}"`,
        })
    for (const r of l.bodyScenarios)
      if (!scenarioIds.has(r.id))
        issues.push({
          file: l.file,
          line: r.line,
          column: r.column,
          field: r.field,
          message: `unknown scenario "${r.id}"`,
        })
  }
  glossary.forEach((t, i) => {
    t.related.forEach((r, j) => {
      if (!termIds.has(r))
        issues.push(
          glossaryYaml?.issue(
            ['terms', i, 'related', j],
            `unknown glossary term "${r}"`,
          ) as ContentIssue,
        )
    })
    if (
      t.introducedIn !== undefined &&
      !byId.has(t.introducedIn) &&
      !invalidLessonIds.has(t.introducedIn)
    )
      issues.push(
        glossaryYaml?.issue(
          ['terms', i, 'introducedIn'],
          `unknown lesson "${t.introducedIn}"`,
        ) as ContentIssue,
      )
  })

  // Prerequisite cycles (E5-01.AC2)
  const state = new Map<string, 'visiting' | 'done'>()
  const reported = new Set<string>()
  const visit = (id: string, path: string[]) => {
    const s = state.get(id)
    if (s === 'done') return
    if (s === 'visiting') {
      const cycle = [...path.slice(path.indexOf(id)), id]
      const key = [...cycle.slice(0, -1)].sort().join(',')
      const lesson = byId.get(id)
      if (lesson && !reported.has(key)) {
        reported.add(key)
        issues.push(
          lesson.yaml.issue(['prerequisites'], `prerequisite cycle: ${cycle.join(' → ')}`),
        )
      }
      return
    }
    state.set(id, 'visiting')
    for (const p of byId.get(id)?.fm.prerequisites ?? []) if (byId.has(p)) visit(p, [...path, id])
    state.set(id, 'done')
  }
  for (const id of [...byId.keys()].sort()) visit(id, [])

  if (issues.length) throw new ContentError(issues)

  // Manifest, in journey order, with summed estimates (E5-01.AC3)
  const byOrder =
    <T>(f: (t: T) => number) =>
    (a: T, b: T) =>
      f(a) - f(b)
  const manifestRegions: RegionEntry[] = [...regions]
    .sort(byOrder((r) => r.file.order))
    .map((r) => {
      const modules: ModuleEntry[] = [...r.modules].sort(byOrder((m) => m.file.order)).map((m) => {
        const ls: LessonEntry[] = [...m.lessons].sort(byOrder((l) => l.fm.order)).map((l) => {
          const fm = withoutOrder(l.fm)
          return {
            ...fm,
            regionId: r.file.id,
            moduleId: m.file.id,
            steps: l.steps.map(({ id, title }) => ({ id, ...(title ? { title } : {}) })),
            terms: [...new Set([...l.fm.terms, ...l.bodyTerms.map((t) => t.id)])],
            file: l.file,
          }
        })
        const mod = withoutOrder(m.file)
        return {
          ...mod,
          regionId: r.file.id,
          estimatedMinutes: ls.reduce((n, l) => n + l.estimatedMinutes, 0),
          lessons: ls,
        }
      })
      const region = withoutOrder(r.file)
      return {
        ...region,
        estimatedMinutes: modules.reduce((n, m) => n + m.estimatedMinutes, 0),
        modules,
      }
    })
  return { manifest: { regions: manifestRegions, glossary }, files }
}

export { ContentError, type ContentIssue }
