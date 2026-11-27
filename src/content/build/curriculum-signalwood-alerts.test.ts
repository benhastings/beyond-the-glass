import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect } from 'vitest'
import { parse } from 'yaml'
import { acTest } from '../../test/ac.ts'
import { FIELD_CARDS } from '../fieldCards.ts'
import { FIRST_FIVE_MINUTES, FIRST_FIVE_SECTIONS } from '../firstFive.ts'
import { reviewNote } from '../incidentNote.ts'

const DIR = join(import.meta.dirname, '../../../content/regions/signalwood/alerts')
const checks = parse(readFileSync(join(DIR, 'first-five-minutes.checks.yaml'), 'utf8')) as {
  checks: { id: string; type: string; items?: { id: string; text: string }[] }[]
}
const lesson = readFileSync(join(DIR, 'first-five-minutes.mdx'), 'utf8')

describe('E9-11 Signalwood III', () => {
  acTest(
    'E9-11.AC1',
    'an ordering check for the first five minutes, and an incident note reviewed against the rubric',
    () => {
      const order = checks.checks.find((c) => c.id === 'first-five-order')
      expect(order?.type).toBe('ordering')
      expect(order?.items?.map((i) => [i.id, i.text])).toEqual(
        FIRST_FIVE_MINUTES.map((s) => [s.id, s.title]),
      )
      expect(lesson).toContain('<Check id="first-five-order" />')
      expect(lesson).toContain('<IncidentNote example />')
      // The rubric: five parts, each with feedback; a good note meets them all, and nothing is scored.
      const good = reviewNote({
        impact: 'About 8% of sends fail; every sender is affected some of the time.',
        timeline: '20:45 ledger 4.3.0 synced; 20:46 errors start; 20:52 paged.',
        evidence: 'Service Overview: api error rate up from 20:46. Argo CD history: sync at 20:45.',
        hypothesis: 'Likely the 20:45 release, because errors began a minute after it.',
        next: 'I’m reverting it through a merge request; Sam watches the error rate.',
      })
      expect(good.map((r) => r.section)).toEqual([
        'impact',
        'timeline',
        'evidence',
        'hypothesis',
        'next',
      ])
      expect(good.every((r) => r.met)).toBe(true)
      const vague = reviewNote({
        impact: 'Errors are up.',
        timeline: 'This evening.',
        evidence: 'Something looks wrong.',
        hypothesis: 'Not sure.',
        next: '',
      })
      expect(vague.filter((r) => r.met)).toEqual([])
      for (const r of vague) expect(r.tip.length, r.section).toBeGreaterThan(20)
      // Feedback per part, never a score.
      expect(Object.keys(vague[0] ?? {}).sort()).toEqual(['label', 'met', 'section', 'tip'])
    },
  )

  acTest(
    'E9-11.AC2',
    'the printable "first five minutes" card follows the lesson’s sequence',
    () => {
      const card = FIELD_CARDS.find((c) => c.id === 'first-five-minutes')
      expect(card).toBeDefined()
      // Every step, in order, across the card's sections; each step's card lines, in order.
      expect(FIRST_FIVE_SECTIONS.flatMap((s) => s.steps)).toEqual(
        FIRST_FIVE_MINUTES.map((s) => s.id),
      )
      const lines = card?.sections.flatMap((s) => s.items.map((i) => i.text)) ?? []
      expect(lines.slice(0, -1)).toEqual(
        FIRST_FIVE_MINUTES.flatMap((s) => s.card.map((c) => c.text)),
      )
      expect(lines.at(-1)).toMatch(/^Write down what you know/)
      // And the lesson's numbered list names the steps in the same order.
      const listed = [...lesson.matchAll(/^\d+\. \*\*([^*]+)\*\*/gm)].map(
        (m) => m[1]?.toLowerCase() ?? '',
      )
      const keys = [
        'acknowledge',
        'assess the impact',
        'check what changed',
        'read the dashboards',
        'open a trace',
        'read that service',
        'check the pods',
      ]
      expect(listed.map((l) => keys.findIndex((k) => l.startsWith(k)))).toEqual([
        0, 1, 2, 3, 4, 5, 6,
      ])
    },
  )
})
