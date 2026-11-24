import { isMap, isSeq, LineCounter, parseDocument, type Node as YamlNode } from 'yaml'
import { scenarioSchema, type Scenario } from '../sim/core/scenario.ts'
import { Simulator } from '../sim/core/simulator.ts'

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
export function parseScenario(text: string, file: string): Scenario {
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
  const result = scenarioSchema.safeParse(doc.toJS())
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
    Simulator.load(result.data)
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
