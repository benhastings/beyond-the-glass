import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse as parseYaml } from 'yaml'
import { describe, expect } from 'vitest'
import { acTest } from '@/test/ac'
import { glossaryFile, rosettaFile, type GlossaryEntry } from './schema'
import { buildIndex, search } from './search'

const read = (f: string) =>
  parseYaml(readFileSync(join(process.cwd(), 'content', f), 'utf8')) as unknown
const glossary = glossaryFile.parse(read('glossary.yaml')).terms
const rosetta = rosettaFile.parse(read('rosetta.yaml')).entries

describe('E2-05 Field Guide search', () => {
  acTest('E2-05.AC2', 'finds terms by name, alias and acronym', () => {
    const index = buildIndex(glossary, rosetta)
    const first = (q: string) => search(index, q)[0]
    expect(first('HPA')).toMatchObject({ kind: 'term', id: 'hpa' })
    expect(first('hpa')?.title).toBe('Horizontal Pod Autoscaler')
    expect(first('OOM')).toMatchObject({ id: 'oom' })
    expect(first('oomkilled')).toMatchObject({ id: 'oom' })
    expect(first('svc')).toMatchObject({ id: 'service' })
    expect(first('SLO')).toMatchObject({ id: 'slo' })
    expect(first('pull request')).toMatchObject({ id: 'merge-request' })
    expect(first('names')?.id).toBe('namespace')
    // Rosetta rows by either side.
    expect(search(index, 'nagios').map((h) => h.kind)).toContain('rosetta')
    expect(search(index, 'tail -f').some((h) => h.title.startsWith('tail -f'))).toBe(true)
    expect(search(index, '  ')).toEqual([])
    expect(search(index, 'zzzz-nothing')).toEqual([])
  })

  acTest('E2-05.AC2', 'searches 300 entries in under 50 ms', () => {
    const many: GlossaryEntry[] = Array.from({ length: 300 }, (_, i) => ({
      id: `term-${String(i)}`,
      term: `Synthetic Term Number ${String(i)}`,
      aliases: [`ST${String(i)}`],
      eli5: `A made-up entry, number ${String(i)}, about pods and nodes.`,
      operator: `Operator text for entry ${String(i)}, mentioning deployments and services.`,
      related: [],
    }))
    const index = buildIndex([...many, ...glossary], rosetta)
    for (const q of ['hpa', 'oom', 'pods', 'synthetic term number 299', 'st150', 'x']) {
      const t0 = process.hrtime.bigint()
      search(index, q)
      expect(Number(process.hrtime.bigint() - t0) / 1e6, q).toBeLessThan(50)
    }
    expect(search(index, 'ST150')[0]?.id).toBe('term-150')
  })
})
