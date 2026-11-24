import { isMap, isSeq, LineCounter, parseDocument, type Node as YamlNode } from 'yaml'
import type { z } from 'zod'

export interface ContentIssue {
  /** Path relative to the content root (or as given). */
  file: string
  line: number
  column: number
  /** Dotted field path, e.g. `prerequisites.1`; empty for the whole file. */
  field: string
  message: string
}

/** Content that failed to build. The message lists every problem as `file:line:column field: message`. */
export class ContentError extends Error {
  readonly issues: ContentIssue[]
  constructor(issues: ContentIssue[]) {
    const sorted = [...issues].sort(
      (a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column,
    )
    super(
      `Content build failed (${String(sorted.length)} problem${sorted.length === 1 ? '' : 's'}):\n${sorted
        .map(
          (i) =>
            `  ${i.file}:${String(i.line)}:${String(i.column)} ${i.field ? `${i.field}: ` : ''}${i.message}`,
        )
        .join('\n')}`,
    )
    this.name = 'ContentError'
    this.issues = sorted
  }
}

/**
 * A parsed YAML source that can say which line any field came from. `lineOffset` is added to every line,
 * for YAML embedded in another file (MDX front matter).
 */
export class YamlSource {
  readonly file: string
  readonly data: unknown
  readonly syntaxIssues: ContentIssue[]
  private readonly doc: ReturnType<typeof parseDocument>
  private readonly lines: LineCounter
  private readonly lineOffset: number

  constructor(text: string, file: string, lineOffset = 0) {
    this.file = file
    this.lineOffset = lineOffset
    this.lines = new LineCounter()
    this.doc = parseDocument(text, { lineCounter: this.lines, prettyErrors: false })
    this.syntaxIssues = this.doc.errors.map((e) => {
      const p = this.lines.linePos(e.pos[0])
      return {
        file,
        line: p.line + lineOffset,
        column: p.col,
        field: '',
        message: e.message.split('\n')[0] ?? e.message,
      }
    })
    this.data = this.syntaxIssues.length ? undefined : (this.doc.toJS() as unknown)
  }

  /** Position of the deepest node along `path` that exists. */
  position(path: readonly PropertyKey[]): { line: number; column: number } {
    let node: YamlNode | null = this.doc.contents
    for (const key of path) {
      let child: unknown
      if (isMap(node)) child = node.get(String(key), true)
      else if (isSeq(node)) child = node.get(Number(key), true)
      if (!child || typeof child !== 'object') break
      node = child as YamlNode
    }
    const p = this.lines.linePos(node?.range?.[0] ?? 0)
    return { line: p.line + this.lineOffset, column: p.col }
  }

  issue(path: readonly PropertyKey[], message: string): ContentIssue {
    return { file: this.file, ...this.position(path), field: path.map(String).join('.'), message }
  }

  /** Validates the data; returns the parsed value, or undefined after adding issues to `out`. */
  parse<S extends z.ZodType>(schema: S, out: ContentIssue[]): z.output<S> | undefined {
    if (this.syntaxIssues.length) {
      out.push(...this.syntaxIssues)
      return undefined
    }
    const r = schema.safeParse(this.data)
    if (r.success) return r.data
    for (const i of r.error.issues) out.push(this.issue(i.path, i.message))
    return undefined
  }
}
