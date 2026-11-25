import type { VFile } from 'vfile'
import { diagramSvg } from './diagrams.ts'

/** The bits of the MDX syntax tree this plugin reads. */
interface Node {
  type: string
  name?: string | null
  lang?: string | null
  value?: string
  children?: Node[]
  attributes?: { type: string; name?: string; value?: unknown }[]
  position?: { start: { line: number; column: number }; end: { line: number; column: number } }
}

/**
 * `<Diagram alt="…">` around a ```mermaid code block (E5-02). Fails the build when `alt` is missing or
 * empty, or when the diagram hasn't been rendered (`npm run diagrams`); otherwise swaps the code for the
 * pre-rendered SVG, passed to the component as its `svg` prop.
 */
export function remarkDiagram() {
  return (tree: Node, file: VFile) => {
    // file:line:column in the message itself, so the build output points straight at the problem.
    const fail = (node: Node, message: string): never => {
      const at = node.position?.start
      return file.fail(
        `${file.path}:${String(at?.line ?? 1)}:${String(at?.column ?? 1)} ${message}`,
        {
          place: node.position,
        },
      )
    }
    const visit = (node: Node) => {
      if (
        (node.type === 'mdxJsxFlowElement' || node.type === 'mdxJsxTextElement') &&
        node.name === 'Diagram'
      ) {
        const attrs = node.attributes ?? []
        const alt = attrs.find((a) => a.type === 'mdxJsxAttribute' && a.name === 'alt')
        if (!alt || typeof alt.value !== 'string' || !alt.value.trim())
          fail(
            node,
            '<Diagram> needs alt text describing what the diagram shows: <Diagram alt="…">',
          )
        const code = (node.children ?? []).find((c) => c.type === 'code' && c.lang === 'mermaid')
        if (!code?.value) return fail(node, '<Diagram> needs a ```mermaid code block inside it')
        const svg = diagramSvg(code.value)
        if (!svg)
          fail(
            node,
            'this diagram has not been rendered: run `npm run diagrams` and commit content/diagrams/',
          )
        attrs.push({ type: 'mdxJsxAttribute', name: 'svg', value: svg })
        node.attributes = attrs
        node.children = []
        return
      }
      for (const c of node.children ?? []) visit(c)
    }
    visit(tree)
  }
}
