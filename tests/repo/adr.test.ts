import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ROOT } from './helpers.ts'

const DIR = join(ROOT, 'docs/adr')
const SECTIONS = ['Context', 'Decision', 'Consequences', 'Alternatives considered']
const REQUIRED = {
  'ADR-001': /frontend stack/i,
  'ADR-002': /routing/i,
  'ADR-003': /progress/i,
  'ADR-004': /simulator/i,
  'ADR-005': /chart/i,
  'ADR-006': /terminal/i,
}
const adrs = readdirSync(DIR).filter((f) => /^ADR-\d{3}-.+\.md$/.test(f))

/** The text under each `## ` heading, keyed by heading. */
function sections(md: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const part of md.split(/^## /m).slice(1)) {
    const nl = part.indexOf('\n')
    out.set(part.slice(0, nl).trim(), part.slice(nl + 1).trim())
  }
  return out
}

describe('E0-07 Architecture Decision Records', () => {
  it('[E0-07.AC1] the six records the issue names exist', () => {
    for (const [id, title] of Object.entries(REQUIRED)) {
      const file = adrs.find((f) => f.startsWith(`${id}-`))
      expect(file, id).toBeDefined()
      expect(readFileSync(join(DIR, file ?? ''), 'utf8').split('\n')[0], id).toMatch(title)
    }
  })

  it.each(adrs)(
    '[E0-07.AC1] %s has Context, Decision, Consequences and Alternatives considered',
    (f) => {
      const s = sections(readFileSync(join(DIR, f), 'utf8'))
      for (const name of SECTIONS) {
        expect(s.has(name), `${f}: missing "## ${name}"`).toBe(true)
        expect((s.get(name) ?? '').length, `${f}: "## ${name}" is empty`).toBeGreaterThan(40)
      }
      expect(readFileSync(join(DIR, f), 'utf8')).toMatch(
        /^- \*\*Status:\*\* (Proposed|Accepted|Superseded by ADR-\d{3})$/m,
      )
    },
  )

  it('the index lists every record', () => {
    const index = readFileSync(join(DIR, 'README.md'), 'utf8')
    for (const f of adrs) expect(index, f).toContain(`](${f})`)
  })
})
