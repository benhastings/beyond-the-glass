import { compile } from '@mdx-js/mdx'
import remarkFrontmatter from 'remark-frontmatter'
import { describe, expect, it } from 'vitest'
import { acTest } from '@/test/ac'
import { diagramHash, diagramSvg } from './diagrams'
import { remarkDiagram } from './remark-diagram'

// The sample lesson's diagram, already rendered into content/diagrams/.
const SOURCE = `flowchart LR
  svc[Service ravenpost-api] --> p1[pod 1]
  svc --> p2[pod 2]
  svc --> p3[pod 3]
`
const mdx = (attrs: string, code = SOURCE) =>
  `---\nid: x\n---\n\n<Diagram ${attrs}>\n\`\`\`mermaid\n${code}\`\`\`\n</Diagram>\n`
const build = (text: string) =>
  compile(
    { value: text, path: 'content/regions/a/b/lesson.mdx' },
    { remarkPlugins: [remarkFrontmatter, remarkDiagram] },
  )

describe('E5-02 diagrams', () => {
  acTest(
    'E5-02.AC1',
    'a <Diagram> without alt text fails the build, naming the file and line',
    async () => {
      await expect(build(mdx(''))).rejects.toThrow(/lesson\.mdx:5:1.*<Diagram> needs alt text/s)
      await expect(build(mdx('alt=""'))).rejects.toThrow(/needs alt text/)
      await expect(build(mdx('alt="  "'))).rejects.toThrow(/needs alt text/)
    },
  )

  it('fails when the diagram has no mermaid block or hasn’t been rendered, and inlines the SVG otherwise', async () => {
    await expect(build('<Diagram alt="x">\nno code\n</Diagram>\n')).rejects.toThrow(
      /needs a ```mermaid code block/,
    )
    await expect(build(mdx('alt="x"', 'flowchart LR\n  a --> never-rendered\n'))).rejects.toThrow(
      /npm run diagrams/,
    )
    const out = String(await build(mdx('alt="A Service and its pods"')))
    expect(diagramSvg(SOURCE)).toBeDefined()
    expect(out).toContain(`d${diagramHash(SOURCE)}`)
    expect(out).not.toContain('flowchart LR')
  })
})
