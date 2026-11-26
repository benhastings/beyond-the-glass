import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseScenario } from '../../src/scenarios/parse.ts'
import { actsOf, SIGNALS } from '../../src/sim/capstone/script.ts'

const ROOT = join(import.meta.dirname, '../..')

describe('E10-02 the capstone’s scenario doc', () => {
  it('[E10-02.AC2] every act lists its evidence in every signal and its expert path, in the scenario doc', () => {
    const file = join(ROOT, 'src/scenarios/the-long-night.yaml')
    const acts = actsOf(parseScenario(readFileSync(file, 'utf8'), file))
    const doc = readFileSync(join(ROOT, 'docs/sim/the-long-night.md'), 'utf8')
    expect(acts).toHaveLength(4)
    for (const a of acts) {
      expect(doc, a.id).toContain(`## ${a.clock} · ${a.title}`)
      for (const s of SIGNALS) expect(doc, `${a.id} ${s}`).toContain(`| ${s} | `)
      expect(a.expertPath.length, a.id).toBeGreaterThan(0)
      expect(doc, a.id).toContain(a.rootCause)
    }
    // The doc is generated from the scenario and must be current.
    execFileSync('node', ['scripts/capstone-doc.mjs', '--check'], { cwd: ROOT, stdio: 'pipe' })
  }, 60_000)
})
