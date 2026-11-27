import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { parse as parseYaml } from 'yaml'
import { FRAGMENT_SCENARIO_IDS } from '../../scenarios/fragment-ids.ts'
import { LESSON_COMPONENT_NAMES } from '../components.ts'
import {
  glossaryFile,
  rosettaFile,
  type RosettaEntry,
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
import { checksFile, testOutFile, type Check, type TestOutCheck } from '../checks.ts'

export interface BuildOptions {
  /** IDs of the scenarios lessons may reference (default: the `id` of every `src/scenarios/*.yaml`). */
  scenarioIds?: readonly string[]
  /** IDs of the challenges `<Terminal challenge>` may name (default: every `src/challenges/*.yaml`). */
  challengeIds?: readonly string[]
}

export interface BuildResult {
  manifest: Manifest
  /** Every file read, for the dev server to watch. */
  files: string[]
  /** Problems worth fixing that don't stop the build, as `file:line:column message`. */
  warnings: string[]
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
  bodyChecks: Ref[]
  bodyRosetta: Ref[]
  bodyChallenges: (Ref & { required: boolean })[]
  checks: Check[]
  checksFile: string
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

const TAG = /<(Step|Term|Terminal|Check|Rosetta)\b([^>]*)>/g
const ATTR = /(\w+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g

/**
 * Capitalised tags in an MDX body that aren't lesson components, with their lines. Code is skipped: fenced
 * blocks, inline code, and `code={`…`}` template strings.
 */
export function unknownComponents(
  body: string,
  firstLine: number,
): { name: string; line: number }[] {
  const known = new Set<string>(LESSON_COMPONENT_NAMES)
  const found: { name: string; line: number }[] = []
  let fenced = false
  let template = false
  body.split('\n').forEach((text, i) => {
    if (/^\s*```/.test(text)) {
      fenced = !fenced
      return
    }
    if (fenced) return
    let scan = text
    if (template) {
      const end = scan.indexOf('`')
      if (end < 0) return
      template = false
      scan = scan.slice(end + 1)
    }
    const open = /code=\{`/.exec(scan)
    if (open) {
      if (!scan.slice(open.index + open[0].length).includes('`')) template = true
      scan = scan.slice(0, open.index)
    }
    for (const m of scan.replace(/`[^`]*`/g, '').matchAll(/<([A-Z][A-Za-z0-9]*)\b/g))
      if (!known.has(m[1] ?? '')) found.push({ name: m[1] ?? '', line: firstLine + i })
  })
  return found
}

/** `<Step id title>`, `<Term id>` and `<Terminal scenario>` uses in an MDX body, with positions. */
function scanBody(body: string, firstLine: number) {
  const steps: LessonSource['steps'] = []
  const terms: Ref[] = []
  const scenarios: Ref[] = []
  const checks: Ref[] = []
  const rosetta: Ref[] = []
  const challenges: (Ref & { required: boolean })[] = []
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
    if (m[1] === 'Terminal' && attrs.challenge !== undefined)
      challenges.push({
        id: attrs.challenge,
        ...at,
        field: '<Terminal challenge>',
        required: /\srequired(\s|=|\/|$)/.test(m[2] ?? ''),
      })
    if (m[1] === 'Check' && attrs.id !== undefined)
      checks.push({ id: attrs.id, ...at, field: '<Check id>' })
    if (m[1] === 'Rosetta' && attrs.id !== undefined)
      rosetta.push({ id: attrs.id, ...at, field: '<Rosetta id>' })
  }
  return { steps, terms, scenarios, checks, challenges, rosetta }
}

/**
 * Reads, validates and cross-checks everything under `root`, and builds the manifest. Throws a
 * ContentError listing every problem with its file, line and field (E5-01.AC1, AC2).
 */
export function buildManifest(root: string, opts: BuildOptions = {}): BuildResult {
  const issues: ContentIssue[] = []
  const warnings: string[] = []
  const files: string[] = []
  const rel = (p: string) => relative(root, p) || '.'
  const read = (p: string) => {
    files.push(p)
    return readFileSync(p, 'utf8')
  }
  const scenarioIds = new Set(
    opts.scenarioIds ?? [
      ...scenarioIdsIn(join(root, '../src/scenarios')),
      ...FRAGMENT_SCENARIO_IDS,
    ],
  )
  const challengeIds = new Set(opts.challengeIds ?? scenarioIdsIn(join(root, '../src/challenges')))

  // Glossary
  const glossaryPath = join(root, 'glossary.yaml')
  let glossary: GlossaryEntry[] = []
  let glossaryYaml: YamlSource | undefined
  if (existsSync(glossaryPath)) {
    glossaryYaml = new YamlSource(read(glossaryPath), rel(glossaryPath))
    glossary = glossaryYaml.parse(glossaryFile, issues)?.terms ?? []
  }
  const termIds = new Set(glossary.map((t) => t.id))
  const rosettaPath = join(root, 'rosetta.yaml')
  let rosetta: RosettaEntry[] | undefined
  if (existsSync(rosettaPath)) {
    const ry = new YamlSource(read(rosettaPath), rel(rosettaPath))
    rosetta = ry.parse(rosettaFile, issues)?.entries ?? []
    const seen = new Set<string>()
    rosetta.forEach((e, i) => {
      if (seen.has(e.id))
        issues.push(ry.issue(['entries', i, 'id'], `duplicate Rosetta Stone id "${e.id}"`))
      seen.add(e.id)
      e.terms.forEach((t, j) => {
        if (!termIds.has(t))
          issues.push(ry.issue(['entries', i, 'terms', j], `unknown glossary term "${t}"`))
      })
    })
  }

  // Regions → modules → lessons
  const invalidLessonIds = new Set<string>()
  const regions: {
    file: RegionFile
    yaml: YamlSource
    modules: {
      file: ModuleFile
      yaml: YamlSource
      lessons: LessonSource[]
      testOut?: { checks: TestOutCheck[]; yaml: YamlSource }
    }[]
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
        for (const u of unknownComponents(parts.body, parts.bodyLine))
          issues.push({
            file: rel(path),
            line: u.line,
            column: 1,
            field: `<${u.name}>`,
            message: `unknown component <${u.name}> (lessons can use ${LESSON_COMPONENT_NAMES.join(', ')})`,
          })
        // A <Depth> without an ELI5 layer is allowed, but newcomers then get no plain-words version (E5-05).
        for (const d of parts.body.matchAll(/<Depth\b[^>]*>([\s\S]*?)<\/Depth>/g))
          if (!/<ELI5\b/.test(d[1] ?? '')) {
            const line = parts.bodyLine + (parts.body.slice(0, d.index).match(/\n/g)?.length ?? 0)
            warnings.push(`${rel(path)}:${String(line)}:1 <Depth> has no <ELI5> layer`)
          }
        // Knowledge checks (E5-03) live beside the lesson: <id>.checks.yaml.
        const checksPath = path.replace(/\.mdx$/, '.checks.yaml')
        let checks: Check[] = []
        if (existsSync(checksPath)) {
          const cy = new YamlSource(read(checksPath), rel(checksPath), 1)
          checks = cy.parse(checksFile, issues)?.checks ?? []
        }
        lessons.push({
          file: rel(path),
          fm,
          yaml: ly,
          steps: body.steps,
          bodyTerms: body.terms,
          bodyScenarios: body.scenarios,
          bodyChecks: body.checks,
          bodyRosetta: body.rosetta,
          bodyChallenges: body.challenges,
          checks,
          checksFile: rel(checksPath),
        })
      }
      // A module may have a test-out (E4-05).
      const testOutPath = join(moduleDir, 'test-out.yaml')
      let testOut: { checks: TestOutCheck[]; yaml: YamlSource } | undefined
      if (existsSync(testOutPath)) {
        const ty = new YamlSource(read(testOutPath), rel(testOutPath))
        const parsed = ty.parse(testOutFile, issues)
        if (parsed) testOut = { checks: parsed.checks, yaml: ty }
      }
      modules.push({ file: mod, yaml: my, lessons, ...(testOut ? { testOut } : {}) })
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

  // Check IDs are unique across the course: progress is stored by check ID.
  const checkOwner = new Map<string, string>()
  for (const l of lessons)
    for (const c of l.checks) {
      const first = checkOwner.get(c.id)
      if (first)
        issues.push({
          file: l.checksFile,
          line: 1,
          column: 1,
          field: 'checks',
          message: `check ID "${c.id}" is already used in ${first}`,
        })
      else checkOwner.set(c.id, l.checksFile)
    }

  // Test-out questions point at the lesson steps that teach them.
  for (const r of regions)
    for (const m of r.modules)
      m.testOut?.checks.forEach((c, i) => {
        const l = m.lessons.find((x) => x.fm.id === c.review.lesson)
        if (!l)
          issues.push(
            m.testOut?.yaml.issue(
              ['checks', i, 'review', 'lesson'],
              `"${c.review.lesson}" is not a lesson in this module`,
            ) as ContentIssue,
          )
        else if (!l.steps.some((s) => s.id === c.review.step))
          issues.push(
            m.testOut?.yaml.issue(
              ['checks', i, 'review', 'step'],
              `no step "${c.review.step}" in ${c.review.lesson}`,
            ) as ContentIssue,
          )
      })

  // References
  for (const l of lessons) {
    for (const r of l.bodyChallenges)
      if (!challengeIds.has(r.id))
        issues.push({
          file: l.file,
          line: r.line,
          column: r.column,
          field: r.field,
          message: `unknown challenge "${r.id}"`,
        })
    for (const r of l.bodyChecks)
      if (!l.checks.some((c) => c.id === r.id))
        issues.push({
          file: l.file,
          line: r.line,
          column: r.column,
          field: r.field,
          message: `unknown check "${r.id}" (define it in ${l.checksFile})`,
        })
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
    for (const r of l.bodyRosetta)
      if (!rosetta?.some((e) => e.id === r.id))
        issues.push({
          file: l.file,
          line: r.line,
          column: r.column,
          field: r.field,
          message: `unknown Rosetta Stone entry "${r.id}"`,
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
            checks: l.checks,
            challenges: l.bodyChallenges.map(({ id, required }) => ({ id, required })),
          }
        })
        const mod = withoutOrder(m.file)
        return {
          ...mod,
          regionId: r.file.id,
          ...(m.testOut ? { testOut: m.testOut.checks } : {}),
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
  return {
    manifest: { regions: manifestRegions, glossary, ...(rosetta ? { rosetta } : {}) },
    files,
    warnings,
  }
}

export { ContentError, type ContentIssue }

/**
 * "Practice next" links (E10-05.AC2): every lesson a scenario act names in `practice` must exist. Returns
 * one message per missing lesson, naming the scenario file and the act; the content plugin fails the
 * build on any.
 */
export function practiceLinkErrors(lessonIds: readonly string[], scenariosDir: string): string[] {
  if (!isDir(scenariosDir)) return []
  const known = new Set(lessonIds)
  const errors: string[] = []
  for (const f of readdirSync(scenariosDir).filter((n) => /\.ya?ml$/.test(n))) {
    const doc = parseYaml(readFileSync(join(scenariosDir, f), 'utf8')) as { acts?: unknown } | null
    const acts = Array.isArray(doc?.acts) ? (doc.acts as unknown[]) : []
    for (const act of acts) {
      const { id, practice } = (act ?? {}) as { id?: unknown; practice?: unknown }
      if (!Array.isArray(practice)) continue
      for (const lesson of practice as unknown[])
        if (typeof lesson !== 'string' || !known.has(lesson))
          errors.push(
            `src/scenarios/${f}: act "${String(id)}" suggests practising lesson "${String(lesson)}", which doesn't exist`,
          )
    }
  }
  return errors
}
