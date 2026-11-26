import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import {
  isMap,
  isSeq,
  LineCounter,
  parse as parseYaml,
  parseDocument,
  type Node as YamlNode,
} from 'yaml'
import { scenarioSchema, type Scenario } from '../sim/core/scenario.ts'
import { loadSimulation } from '../sim/controllers/index.ts'

export interface ScenarioIssue {
  file: string
  line: number
  column: number
  path: string
  message: string
}

/** A scenario that failed validation. The message lists every problem as `file:line:column path: message`. */
export class ScenarioError extends Error {
  readonly issues: ScenarioIssue[]
  constructor(issues: ScenarioIssue[]) {
    super(
      `Invalid scenario:\n${issues.map((i) => `  ${i.file}:${String(i.line)}:${String(i.column)} ${i.path ? `${i.path}: ` : ''}${i.message}`).join('\n')}`,
    )
    this.name = 'ScenarioError'
    this.issues = issues
  }
}

/** The deepest YAML node that exists along `path`, so an issue points at the closest line. */
function nodeAt(root: YamlNode | null, path: readonly PropertyKey[]): YamlNode | null {
  let node = root
  for (const key of path) {
    let child: unknown
    if (isMap(node)) child = node.get(String(key), true)
    else if (isSeq(node)) child = node.get(Number(key), true)
    if (!child || typeof child !== 'object') break
    node = child as YamlNode
  }
  return node
}

/**
 * Parses and validates scenario YAML. Throws a ScenarioError naming the file, line and field of every
 * problem: YAML syntax, schema violations, broken references, or a scenario the simulator can't load.
 */
type Raw = Record<string, unknown>
const isObj = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v)
const byName = (base: unknown, over: unknown): unknown[] => {
  const b = Array.isArray(base) ? (base as Raw[]) : []
  const o = Array.isArray(over) ? (over as Raw[]) : []
  return [...b.filter((x) => !o.some((y) => y.name === x.name)), ...o]
}

/**
 * `extends: <id>` (E10-02): start from another scenario in the same folder and change it. The new one's
 * fields replace the base's, except: `timeline`, `objectives` and `acts` are added after the base's;
 * `images` and gitops `repos`/`ci` are merged by key; gitops `applications` and telemetry `services` are
 * merged by name. Clusters and contexts come from the base unless replaced whole.
 */
export function mergeScenario(base: Raw, over: Raw): Raw {
  const out: Raw = { ...base, ...over }
  delete out.extends
  for (const k of ['timeline', 'objectives', 'acts'])
    if (k in base || k in over)
      out[k] = [
        ...((base[k] as unknown[] | undefined) ?? []),
        ...((over[k] as unknown[] | undefined) ?? []),
      ]
  if (isObj(base.images) || isObj(over.images))
    out.images = { ...(base.images as Raw), ...(over.images as Raw) }
  if (isObj(base.gitops) && isObj(over.gitops)) {
    const b = base.gitops
    const o = over.gitops
    out.gitops = {
      ...b,
      ...o,
      repos: { ...(b.repos as Raw), ...(o.repos as Raw) },
      ci: { ...(b.ci as Raw), ...(o.ci as Raw) },
      applications: byName(b.applications, o.applications),
    }
  }
  if (isObj(base.telemetry) && isObj(over.telemetry))
    out.telemetry = {
      ...base.telemetry,
      ...over.telemetry,
      services: byName(base.telemetry.services, over.telemetry.services),
    }
  return out
}

/** The raw scenario with any `extends` resolved (recursively), reading bases next to `file`. */
function resolveExtends(
  raw: Raw,
  file: string,
  seen: string[],
  onRead?: (path: string) => void,
): Raw {
  const base = raw.extends
  if (typeof base !== 'string') return raw
  if (seen.includes(base)) throw new Error(`extends loops: ${[...seen, base].join(' → ')}`)
  const candidates = [
    join(dirname(file), `${base}.yaml`),
    join(import.meta.dirname, `${base}.yaml`),
  ]
  const path = candidates.find((c) => existsSync(c))
  if (!path) throw new Error(`extends: no scenario "${base}" next to ${file}`)
  onRead?.(path)
  const parent = resolveExtends(
    parseYaml(readFileSync(path, 'utf8')) as Raw,
    path,
    [...seen, base],
    onRead,
  )
  return mergeScenario(parent, raw)
}

export function parseScenario(
  text: string,
  file: string,
  onRead?: (path: string) => void,
): Scenario {
  const lines = new LineCounter()
  const doc = parseDocument(text, { lineCounter: lines, prettyErrors: false })
  const at = (offset: number | undefined) => lines.linePos(offset ?? 0)
  if (doc.errors.length > 0) {
    throw new ScenarioError(
      doc.errors.map((e) => {
        const pos = at(e.pos[0])
        return {
          file,
          line: pos.line,
          column: pos.col,
          path: '',
          message: e.message.split('\n')[0] ?? e.message,
        }
      }),
    )
  }
  let raw = doc.toJS() as Raw
  try {
    raw = resolveExtends(raw, file, [], onRead)
  } catch (e) {
    throw new ScenarioError([
      { file, line: 1, column: 1, path: 'extends', message: (e as Error).message },
    ])
  }
  const result = scenarioSchema.safeParse(raw)
  if (!result.success) {
    throw new ScenarioError(
      result.error.issues.map((issue) => {
        const node = nodeAt(doc.contents, issue.path)
        const pos = at(node?.range?.[0])
        return {
          file,
          line: pos.line,
          column: pos.col,
          path: issue.path.join('.'),
          message: issue.message,
        }
      }),
    )
  }
  try {
    // With the controllers, so a warm-up (warmUp) plays the timeline as it will in the app.
    loadSimulation(result.data)
  } catch (e) {
    throw new ScenarioError([
      {
        file,
        line: 1,
        column: 1,
        path: '',
        message: `simulator could not load it: ${(e as Error).message}`,
      },
    ])
  }
  return result.data
}
