import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse as parseYaml } from 'yaml'
import { describe, expect, it } from 'vitest'
import { acTest } from '@/test/ac'
import { fleschKincaid, lintYaml, STEM_MAX_GRADE } from '../content/lint/rules'
import { bankSchema, NOT_SURE, PLACEMENT_DOMAINS } from './bank'

const FILE = join(process.cwd(), 'content/threshold/bank.yaml')
const raw = () =>
  parseYaml(readFileSync(FILE, 'utf8')) as Record<string, unknown> & {
    items: Record<string, unknown>[]
  }

describe('E4-01 question bank', () => {
  acTest('E4-01.AC1', 'the bank validates against its schema, as the build checks it', () => {
    const bank = bankSchema.parse(raw())
    expect(bank.items.length).toBeGreaterThanOrEqual(25)
    for (const d of PLACEMENT_DOMAINS) {
      const items = bank.items.filter((i) => i.domain === d)
      expect(items.length, d).toBeGreaterThanOrEqual(5)
      expect(items.filter((i) => i.kind === 'experience').length, d).toBeGreaterThanOrEqual(1)
      expect(
        items.some((i) => i.kind === 'scenario' && i.difficulty === 1),
        d,
      ).toBe(true)
    }
    for (const i of bank.items)
      if (i.kind === 'scenario')
        expect(i.options.at(-1), i.id).toEqual({ id: NOT_SURE, text: 'I’m not sure yet' })
  })

  acTest('E4-01.AC1', 'the schema rejects the mistakes an author could make', () => {
    const issues = (mutate: (b: ReturnType<typeof raw>) => void) => {
      const b = raw()
      mutate(b)
      const r = bankSchema.safeParse(b)
      return r.success ? [] : r.error.issues.map((i) => i.message)
    }
    const scenario = (b: ReturnType<typeof raw>) =>
      b.items.find((i) => i.kind === 'scenario') as Record<string, unknown> & {
        options: { id: string; text: string }[]
      }
    expect(issues(() => undefined)).toEqual([])
    expect(
      issues((b) => {
        scenario(b).correct = 'nope'
      }),
    ).toContain('"nope" is not one of the options')
    expect(
      issues((b) => {
        scenario(b).options.pop()
      }),
    ).toEqual([expect.stringMatching(/last option must be/)])
    expect(
      issues((b) => {
        scenario(b).correct = NOT_SURE
      }),
    ).toContain('“not sure” can’t be correct')
    expect(
      issues((b) => {
        b.items.push({ ...b.items[0] })
      }),
    ).toContain(`duplicate item "${String(b0id())}"`)
    expect(
      issues((b) => {
        b.items = b.items.filter((i) => i.domain !== 'delivery' || i.kind === 'experience')
      }),
    ).toEqual(expect.arrayContaining([expect.stringMatching(/^delivery needs at least 5 items/)]))
    expect(
      issues((b) => {
        ;(b.serving as { total: number }).total = 30
      }),
    ).toEqual([expect.stringMatching(/total must be between 10 and 15/)])
    const exp = (b: ReturnType<typeof raw>) =>
      b.items.find((i) => i.kind === 'experience') as { options: { level: number }[] }
    expect(
      issues((b) => {
        exp(b).options.reverse()
      }),
    ).toContain('options go from level 0 to level 3, in order')
  })

  acTest(
    'E4-01.AC4',
    'every question stem reads at grade 9 or below, and the content lint checks it',
    () => {
      const bank = bankSchema.parse(raw())
      for (const i of bank.items)
        expect(fleschKincaid(i.stem), `${i.id}: ${i.stem}`).toBeLessThanOrEqual(STEM_MAX_GRADE)
      expect(lintYaml('bank.yaml', readFileSync(FILE, 'utf8'))).toEqual([])
      const hard =
        'items:\n  - stem: Considering organisational interdependencies, which infrastructural reconfiguration minimises operational disruption?\n'
      expect(lintYaml('b.yaml', hard).map((f) => f.rule)).toEqual(['stem-grade'])
    },
  )

  it('every item explains itself in one sentence', () => {
    for (const i of bankSchema.parse(raw()).items)
      expect(i.why.split(/[.!?](\s|$)/).filter((s) => s.trim()).length, i.id).toBeLessThanOrEqual(2)
  })
})

const b0id = () => raw().items[0]?.id
