import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse as parseYaml } from 'yaml'
import { describe, expect, it } from 'vitest'
import { acTest } from '@/test/ac'
import type { LessonEntry, Manifest, ModuleEntry } from '../content/schema'
import { bankSchema, NOT_SURE, PLACEMENT_DOMAINS, type Bank, type PlacementDomain } from './bank'
import {
  buildPath,
  levelsOf,
  quizLength,
  score,
  selectItems,
  wayfarerEverywhere,
  type Answers,
  type Level,
} from './engine'

const BANK: Bank = bankSchema.parse(
  parseYaml(readFileSync(join(process.cwd(), 'content/threshold/bank.yaml'), 'utf8')),
)

/** A manifest with one module per domain at each lesson level, in two regions. */
const lesson = (id: string, level: LessonEntry['level'], domain: PlacementDomain): LessonEntry => ({
  id,
  regionId: 'r',
  moduleId: 'm',
  title: id,
  objectives: ['o'],
  estimatedMinutes: 5,
  domain,
  level,
  prerequisites: [],
  terms: [],
  steps: [],
  file: `${id}.mdx`,
  checks: [],
  challenges: [],
})
const mod = (
  regionId: string,
  id: string,
  domain: PlacementDomain,
  level: LessonEntry['level'],
): ModuleEntry => ({
  id,
  regionId,
  title: id,
  summary: 's',
  domain,
  estimatedMinutes: 5,
  lessons: [lesson(`${id}-1`, level, domain), lesson(`${id}-2`, 'pathfinder', domain)],
})
const MANIFEST: Manifest = {
  glossary: [],
  regions: [
    {
      id: 'console-room',
      title: 'Console Room',
      summary: 's',
      mood: 'console',
      estimatedMinutes: 10,
      modules: [
        mod('console-room', 'foundations-basics', 'foundations', 'wayfarer'),
        mod('console-room', 'foundations-deeper', 'foundations', 'navigator'),
      ],
    },
    {
      id: 'harbor',
      title: 'Harbor',
      summary: 's',
      mood: 'reach',
      estimatedMinutes: 10,
      modules: [
        mod('harbor', 'containers-basics', 'containers', 'wayfarer'),
        mod('harbor', 'containers-builds', 'containers', 'deckhand'),
      ],
    },
    {
      id: 'chartroom',
      title: 'Chartroom',
      summary: 's',
      mood: 'reach',
      estimatedMinutes: 10,
      modules: [
        mod('chartroom', 'k8s-first-look', 'kubernetes', 'wayfarer'),
        mod('chartroom', 'k8s-workloads', 'kubernetes', 'deckhand'),
        mod('chartroom', 'k8s-debugging', 'kubernetes', 'navigator'),
      ],
    },
    {
      id: 'mirror-lake',
      title: 'Mirror Lake',
      summary: 's',
      mood: 'reach',
      estimatedMinutes: 10,
      modules: [
        mod('mirror-lake', 'delivery-gitops', 'delivery', 'deckhand'),
        mod('mirror-lake', 'o11y-signals', 'observability', 'wayfarer'),
      ],
    },
  ],
}

const item = (id: string) => {
  const it = BANK.items.find((i) => i.id === id)
  if (!it) throw new Error(id)
  return it
}
/** Answers a whole quiz: experience levels per domain, and per scenario whether to get it right. */
function takeQuiz(
  experience: Record<PlacementDomain, Level>,
  scenarios: 'right' | 'wrong' | 'not-sure' | ((id: string) => 'right' | 'wrong' | 'not-sure'),
): Answers {
  const answers: Record<string, string> = {}
  for (;;) {
    const next = selectItems(BANK, answers).find((i) => answers[i.id] === undefined)
    if (!next) return answers
    if (next.kind === 'experience')
      answers[next.id] = next.options[experience[next.domain]]?.id ?? ''
    else {
      const how = typeof scenarios === 'function' ? scenarios(next.id) : scenarios
      answers[next.id] =
        how === 'right'
          ? next.correct
          : how === 'not-sure'
            ? NOT_SURE
            : (next.options.find((o) => o.id !== next.correct && o.id !== NOT_SURE)?.id ?? '')
    }
  }
}
const all = (l: Level) =>
  Object.fromEntries(PLACEMENT_DOMAINS.map((d) => [d, l])) as Record<PlacementDomain, Level>

/** The four personas in docs/design/placement.md#personas, with their expected placements. */
const PERSONAS = [
  {
    name: 'New to all of it',
    answers: () => takeQuiz(all(0), 'not-sure'),
    levels: { foundations: 0, containers: 0, kubernetes: 0, delivery: 0, observability: 0 },
    start: 'foundations-basics',
  },
  {
    name: 'NOC veteran',
    answers: () =>
      takeQuiz(
        { foundations: 3, containers: 1, kubernetes: 0, delivery: 1, observability: 2 },
        (id) =>
          id.startsWith('foundations') ||
          id.startsWith('observability') ||
          id === 'containers-image-vs-container'
            ? 'right'
            : 'not-sure',
      ),
    levels: { foundations: 3, containers: 1, kubernetes: 0, delivery: 0, observability: 2 },
    start: 'containers-builds',
  },
  {
    name: 'Container developer',
    answers: () =>
      takeQuiz(
        { foundations: 2, containers: 3, kubernetes: 2, delivery: 3, observability: 1 },
        (id) => (id === 'kubernetes-pending' ? 'wrong' : 'right'),
      ),
    levels: { foundations: 2, containers: 3, kubernetes: 1, delivery: 3, observability: 1 },
    start: 'foundations-deeper',
  },
  {
    name: 'Platform engineer',
    answers: () => takeQuiz(all(3), 'right'),
    levels: { foundations: 3, containers: 3, kubernetes: 3, delivery: 3, observability: 3 },
    start: 'foundations-deeper',
  },
] as const

describe('E4-03 placement engine', () => {
  for (const p of PERSONAS)
    acTest('E4-03.AC1', `${p.name}: documented placement and starting module`, () => {
      const answers = p.answers()
      const levels = levelsOf(score(BANK, answers))
      expect(levels).toEqual(p.levels)
      expect(buildPath(levels, MANIFEST).start?.moduleId).toBe(p.start)
      expect(Object.keys(answers).length).toBeGreaterThanOrEqual(5)
      expect(Object.keys(answers).length).toBeLessThanOrEqual(15)
    })

  acTest(
    'E4-03.AC1',
    'serving: experience first, then scenarios by self-report; new learners get the easiest one only',
    () => {
      expect(selectItems(BANK, {}).map((i) => i.kind)).toEqual(Array(5).fill('experience'))
      const never = { [item('containers-use').id]: 'never' }
      expect(
        selectItems(BANK, never)
          .filter((i) => i.domain === 'containers')
          .map((i) => i.id),
      ).toEqual(['containers-use', 'containers-image-vs-container'])
      const weekly = { 'containers-use': 'weekly' }
      expect(
        selectItems(BANK, weekly)
          .filter((i) => i.domain === 'containers')
          .map((i) => i.difficulty),
      ).toEqual([1, 2, 3])
      const sometimes = { 'containers-use': 'sometimes' }
      expect(
        selectItems(BANK, sometimes)
          .filter((i) => i.domain === 'containers')
          .map((i) => i.difficulty),
      ).toEqual([1, 1, 2])
      // The usual quiz is 12 questions; the estimate is exact once everything is decided.
      expect(quizLength(BANK, {})).toBe(10)
      const done = takeQuiz(all(1), 'right')
      expect(quizLength(BANK, done)).toBe(Object.keys(done).length)
      expect(
        Object.keys(
          takeQuiz(
            { foundations: 2, containers: 1, kubernetes: 2, delivery: 1, observability: 1 },
            'right',
          ),
        ).length,
      ).toBe(12)
    },
  )

  acTest(
    'E4-03.AC1',
    'scoring: the lower of self-report and scenarios, flagged when they disagree',
    () => {
      const s = score(BANK, takeQuiz(all(3), 'wrong'))
      expect(s.kubernetes).toEqual({ level: 0, selfReport: 3, scenario: 0, confirm: true })
      const humble = score(BANK, takeQuiz(all(0), 'right'))
      expect(humble.containers).toEqual({ level: 0, selfReport: 0, scenario: 1, confirm: true })
      const agree = score(BANK, takeQuiz(all(1), 'right'))
      expect(agree.delivery).toEqual({ level: 1, selfReport: 1, scenario: 1, confirm: false })
      // No answers at all: wayfarer everywhere, nothing to confirm.
      expect(score(BANK, {})).toEqual(wayfarerEverywhere())
      // A self-report alone (scenarios not reached) stands.
      expect(score(BANK, { 'kubernetes-use': 'sometimes' }).kubernetes).toEqual({
        level: 2,
        selfReport: 2,
        scenario: 0,
        confirm: false,
      })
    },
  )

  acTest('E4-03.AC1', 'the path: statuses, reasons, starting module and depth per region', () => {
    const plan = buildPath(
      { foundations: 2, containers: 0, kubernetes: 1, delivery: 1, observability: 3 },
      MANIFEST,
    )
    const status = Object.fromEntries(plan.modules.map((m) => [m.moduleId, m.status]))
    expect(status).toEqual({
      'foundations-basics': 'test-out',
      'foundations-deeper': 'recommended',
      'containers-basics': 'recommended',
      'containers-builds': 'recommended',
      'k8s-first-look': 'review',
      'k8s-workloads': 'recommended',
      'k8s-debugging': 'recommended',
      'delivery-gitops': 'recommended',
      'o11y-signals': 'test-out',
    })
    expect(plan.start).toMatchObject({
      moduleId: 'foundations-deeper',
      firstLesson: 'foundations-deeper-1',
    })
    expect(plan.modules.find((m) => m.moduleId === 'containers-builds')?.reason).toBe(
      'Recommended because you’re new to containers.',
    )
    expect(plan.modules.find((m) => m.moduleId === 'k8s-debugging')?.reason).toBe(
      'Recommended: the next step from what you know about Kubernetes.',
    )
    expect(plan.modules.find((m) => m.moduleId === 'k8s-first-look')?.reason).toMatch(
      /^Worth a quick review/,
    )
    expect(plan.modules.find((m) => m.moduleId === 'o11y-signals')?.reason).toMatch(
      /^You can test out/,
    )
    expect(plan.depthByRegion).toEqual({
      'console-room': 'operator',
      harbor: 'eli5',
      chartroom: 'operator',
      'mirror-lake': 'operator',
    })
    // Everything known: nothing recommended, so the first review; an empty course has no start.
    expect(buildPath(all(3), MANIFEST).start?.status).toBe('review')
    expect(buildPath(all(0), { regions: [], glossary: [] })).toEqual({
      modules: [],
      depthByRegion: {},
    })
    const allTestOut = buildPath(all(3), {
      glossary: [],
      regions: [
        { ...MANIFEST.regions[1], modules: [mod('harbor', 'x', 'containers', 'wayfarer')] },
      ] as Manifest['regions'],
    })
    expect(allTestOut.start?.status).toBe('test-out')
    const empty = buildPath(all(0), {
      glossary: [],
      regions: [
        {
          ...MANIFEST.regions[1],
          modules: [{ ...mod('harbor', 'e', 'containers', 'wayfarer'), lessons: [] }],
        },
      ] as Manifest['regions'],
    })
    expect(empty.start).toMatchObject({ level: 0, status: 'recommended' })
    expect(empty.start).not.toHaveProperty('firstLesson')
  })

  acTest('E4-03.AC2', 'the engine is deterministic and imports no React or DOM', () => {
    const a = takeQuiz(
      { foundations: 2, containers: 1, kubernetes: 3, delivery: 0, observability: 2 },
      'right',
    )
    expect(selectItems(BANK, a)).toEqual(selectItems(BANK, a))
    expect(score(BANK, a)).toEqual(score(BANK, a))
    expect(buildPath(levelsOf(score(BANK, a)), MANIFEST)).toEqual(
      buildPath(levelsOf(score(BANK, a)), MANIFEST),
    )
    const src = readFileSync(join(process.cwd(), 'src/placement/engine.ts'), 'utf8')
    expect(src).not.toMatch(/from 'react|document\.|window\.|Math\.random|Date\.now/)
  })

  acTest('E4-03.AC4', 'adding a module or a question needs no code change', () => {
    const more: Manifest = {
      ...MANIFEST,
      regions: [
        ...MANIFEST.regions,
        {
          id: 'stormwatch',
          title: 'Stormwatch',
          summary: 's',
          mood: 'stormwatch',
          estimatedMinutes: 5,
          modules: [mod('stormwatch', 'o11y-slos', 'observability', 'navigator')],
        },
      ],
    }
    const plan = buildPath(all(1), more)
    expect(plan.modules.at(-1)).toMatchObject({ moduleId: 'o11y-slos', status: 'recommended' })
    expect(plan.depthByRegion.stormwatch).toBe('operator')
    const bank: Bank = {
      ...BANK,
      items: [
        ...BANK.items,
        {
          id: 'containers-new',
          kind: 'scenario',
          domain: 'containers',
          difficulty: 1,
          stem: 'New?',
          options: [
            { id: 'a', text: 'A' },
            { id: NOT_SURE, text: 'I’m not sure yet' },
          ],
          correct: 'a',
          why: 'w',
        },
      ],
    }
    expect(score(bank, { 'containers-use': 'tried', 'containers-new': 'a' }).containers.level).toBe(
      1,
    )
  })

  it('a bank with a missing difficulty falls back to the nearest easier item', () => {
    const bank: Bank = {
      ...BANK,
      items: BANK.items.filter(
        (i) => !(i.domain === 'kubernetes' && i.kind === 'scenario' && i.difficulty === 3),
      ),
    }
    expect(
      selectItems(bank, { 'kubernetes-use': 'weekly' })
        .filter((i) => i.domain === 'kubernetes')
        .map((i) => i.difficulty),
    ).toEqual([1, 2, 2])
    const noExperience: Bank = {
      ...BANK,
      items: BANK.items.filter((i) => !(i.domain === 'delivery' && i.kind === 'experience')),
    }
    expect(selectItems(noExperience, {}).some((i) => i.domain === 'delivery')).toBe(false)
    expect(score(noExperience, {}).delivery.level).toBe(0)
  })
})
