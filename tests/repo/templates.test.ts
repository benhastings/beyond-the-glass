import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { ROOT } from './helpers.ts'

const read = (f: string) => readFileSync(join(ROOT, f), 'utf8')

/** The checklist items under "## 4. Definition of Done" in AGENTS.md, verbatim. */
function dodItems(): string[] {
  const section =
    /^## 4\. Definition of Done\n([\s\S]*?)(?=^## )/m.exec(read('AGENTS.md'))?.[1] ?? ''
  return section.split('\n').filter((l) => l.startsWith('- [ ] '))
}

interface IssueForm {
  name: string
  description: string
  body: { type: string; id?: string; attributes: { label?: string } }[]
}

describe('E0-04 templates and CODEOWNERS', () => {
  it('[E0-04.AC2] the PR template contains every Definition of Done item from AGENTS.md verbatim', () => {
    const items = dodItems()
    expect(items.length).toBeGreaterThanOrEqual(10)
    const template = read('.github/pull_request_template.md').split('\n')
    for (const item of items) expect(template, `missing or reworded: ${item}`).toContain(item)
  })

  it('[E0-04.AC2] the PR template asks for screenshots and copied acceptance criteria', () => {
    const template = read('.github/pull_request_template.md')
    expect(template).toMatch(/screenshots\/recording for UI changes/)
    expect(template).toMatch(/acceptance criteria copied/)
    expect(template).toMatch(/^Closes #/m)
  })

  it('has the four issue forms, each a valid GitHub issue form', () => {
    const dir = '.github/ISSUE_TEMPLATE'
    const forms = readdirSync(join(ROOT, dir)).filter((f) => f !== 'config.yml')
    expect(forms.sort()).toEqual(['bug.yml', 'feature.yml', 'lesson.yml', 'scenario.yml'])
    for (const f of forms) {
      const form = parse(read(`${dir}/${f}`)) as IssueForm
      expect(form.name, f).toBeTruthy()
      expect(form.description, f).toBeTruthy()
      const fields = form.body.filter((b) => b.type !== 'markdown')
      expect(fields.length, f).toBeGreaterThan(0)
      const ids = fields.map((b) => b.id)
      expect(new Set(ids).size, `${f}: duplicate ids`).toBe(ids.length)
      for (const b of fields) {
        expect(b.id, `${f}: every field needs an id`).toMatch(/^[a-z][a-z0-9_-]*$/)
        expect(b.attributes.label, `${f}: ${String(b.id)} needs a label`).toBeTruthy()
      }
    }
  })

  it('routes content, scenarios and evidence to a code owner', () => {
    const rules = read('.github/CODEOWNERS')
      .split('\n')
      .filter((l) => l.trim() && !l.startsWith('#'))
      .map((l) => l.split(/\s+/))
    for (const path of ['/content/', '/src/scenarios/', '/docs/evidence/']) {
      const rule = rules.find((r) => r[0] === path)
      expect(rule, path).toBeDefined()
      expect(
        rule?.slice(1).every((o) => o.startsWith('@')),
        path,
      ).toBe(true)
    }
  })
})
