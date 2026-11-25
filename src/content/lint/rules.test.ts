import { describe, expect } from 'vitest'
import { acTest } from '@/test/ac'
import { fleschKincaid, lintMdx, lintYaml, STEP_MAX_WORDS } from './rules'

const fm = '---\nid: x\nobjectives:\n  - Do a thing\n---\n'
const rules = (text: string) => lintMdx('l.mdx', text).map((f) => `${String(f.line)} ${f.rule}`)

describe('E5-06 content lint', () => {
  acTest('E5-06.AC1', 'flags banned words in prose, not in code, and honours lint-allow', () => {
    expect(rules(`${fm}\nIt's simply a pod.\nJust run it. Obviously easy.\n`)).toEqual([
      '7 banned-word',
      '8 banned-word',
      '8 banned-word',
      '8 banned-word',
    ])
    expect(
      rules(
        `${fm}\nRun \`just\` here.\n\n\`\`\`sh\necho simply\n\`\`\`\n<CodeBlock code="just" />\n`,
      ),
    ).toEqual([])
    expect(
      rules(
        `${fm}\n{/* lint-allow: banned-word — quoting a log line */}\nThe log says "just retrying".\n`,
      ),
    ).toEqual([])
    expect(rules(`${fm}\nThe log says just retrying. {/* lint-allow: banned-word */}\n`)).toEqual(
      [],
    )
    // An allow for another rule doesn't silence this one.
    expect(rules(`${fm}\n{/* lint-allow: step-length */}\nSimply.\n`)).toEqual(['8 banned-word'])
  })

  acTest(
    'E5-06.AC1',
    'flags missing objectives, images without alt, long steps and hard ELI5 text',
    () => {
      expect(rules('---\nid: x\nobjectives: []\n---\nHi.\n')).toEqual(['1 no-objectives'])
      expect(rules('---\nid: x\n---\nHi.\n')).toEqual(['1 no-objectives'])
      expect(
        rules(
          `${fm}\n![](pods.png)\n<img src="a.png" />\n![Three pods](ok.png)\n<img src="b.png" alt="A node" />\n`,
        ),
      ).toEqual(['7 image-alt', '8 image-alt'])
      const long = Array.from({ length: STEP_MAX_WORDS + 5 }, () => 'word').join(' ')
      expect(
        rules(`${fm}\n<Step id="a">\n${long}\n</Step>\n<Step id="b">\nShort.\n</Step>\n`),
      ).toEqual(['7 step-length'])
      const hard =
        'Containerisation fundamentally necessitates sophisticated orchestration infrastructure, facilitating declarative reconciliation.'
      expect(rules(`${fm}\n<Depth>\n<ELI5>${hard}</ELI5>\n</Depth>\n`)).toEqual(['8 eli5-grade'])
      expect(rules(`${fm}\n<Callout kind="eli5">${hard}</Callout>\n`)).toEqual(['7 eli5-grade'])
      expect(
        rules(`${fm}\n<ELI5>A pod is a box for your program. The cluster can move it.</ELI5>\n`),
      ).toEqual([])
    },
  )

  acTest(
    'E5-06.AC1',
    'YAML: banned words in values, the grade of eli5 fields; ids, patterns and code are skipped',
    () => {
      const y = `checks:\n  - id: just-a-check\n    prompt: Simply choose one.\n    pattern: 'just'\n    code: |\n      just: true\n    explanation: Fine.\n    # lint-allow: banned-word\n    feedback: It's just that.\n`
      expect(lintYaml('c.yaml', y).map((f) => `${String(f.line)} ${f.rule}`)).toEqual([
        '3 banned-word',
      ])
      expect(
        lintYaml(
          'g.yaml',
          'terms:\n  - eli5: Containerisation fundamentally necessitates sophisticated orchestration.\n',
        )[0]?.rule,
      ).toBe('eli5-grade')
    },
  )

  acTest('E5-06.AC1', 'Flesch-Kincaid grades plain text low and dense text high', () => {
    expect(fleschKincaid('The cat sat. It was warm.')).toBeLessThan(3)
    expect(
      fleschKincaid(
        'Organisational interdependencies necessitate comprehensive infrastructural considerations.',
      ),
    ).toBeGreaterThan(12)
    expect(fleschKincaid('')).toBe(0)
  })
})
