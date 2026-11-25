import { describe, expect, it } from 'vitest'
import type { LessonEntry, Manifest, ModuleEntry } from '../content/schema'
import { progressV1, type Progress } from '../progress/schema'
import { journey, learnerLevels, regionLabel } from './journey'

const lesson = (
  id: string,
  domain: LessonEntry['domain'],
  level: LessonEntry['level'] = 'wayfarer',
): LessonEntry => ({
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
  domain: LessonEntry['domain'],
  levels: LessonEntry['level'][],
): ModuleEntry => ({
  id,
  regionId,
  title: id,
  summary: 's',
  domain,
  estimatedMinutes: 5,
  lessons: levels.map((l, i) => lesson(`${id}-${String(i)}`, domain, l)),
})
const M: Manifest = {
  glossary: [],
  regions: [
    {
      id: 'a',
      title: 'A',
      summary: 's',
      mood: 'reach',
      estimatedMinutes: 5,
      modules: [
        mod('a', 'a1', 'foundations', ['wayfarer']),
        mod('a', 'a2', 'foundations', ['deckhand']),
      ],
    },
    {
      id: 'b',
      title: 'B',
      summary: 's',
      mood: 'reach',
      estimatedMinutes: 5,
      modules: [mod('b', 'b1', 'containers', ['wayfarer', 'wayfarer'])],
    },
    { id: 'c', title: 'C', summary: 's', mood: 'reach', estimatedMinutes: 0, modules: [] },
    {
      id: 'd',
      title: 'D',
      summary: 's',
      mood: 'reach',
      estimatedMinutes: 0,
      modules: [{ ...mod('d', 'd1', 'delivery', []), lessons: [] }],
    },
  ],
}
const fresh = (): Progress =>
  progressV1.parse({
    schemaVersion: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  })
const done = (p: Progress, ...ids: string[]): Progress => ({
  ...p,
  lessons: Object.fromEntries(
    ids.map((id) => [
      id,
      { currentStep: 0, completedSteps: [], completedAt: '2026-01-02T00:00:00Z' },
    ]),
  ),
})
const statuses = (p: Progress) =>
  journey(M, p).regions.map(
    (r) => `${r.id}:${r.status}:${r.modules.map((m) => `${m.id}=${m.status}`).join(',')}`,
  )

describe('journey statuses', () => {
  it('before the Threshold: the first unfinished module is next; nothing is optional', () => {
    expect(statuses(fresh())).toEqual([
      'a:recommended:a1=recommended,a2=not-started',
      'b:not-started:b1=not-started',
      'c:not-started:',
      'd:not-started:d1=not-started',
    ])
    expect(journey(M, fresh()).regions[0]?.modules[0]).not.toHaveProperty('reason')
  })

  it('progress: complete, in progress and next as lessons are done', () => {
    let p = done(fresh(), 'a1-0')
    expect(statuses(p)[0]).toBe('a:in-progress:a1=complete,a2=recommended')
    p = done(fresh(), 'a1-0', 'a2-0', 'b1-0')
    expect(statuses(p).slice(0, 2)).toEqual([
      'a:complete:a1=complete,a2=complete',
      'b:in-progress:b1=in-progress',
    ])
    p = { ...fresh(), lessons: { 'b1-1': { currentStep: 2, completedSteps: [], depth: 'eli5' } } }
    expect(statuses(p)[1]).toBe('b:in-progress:b1=in-progress')
    p = done(fresh(), 'a1-0', 'a2-0', 'b1-0', 'b1-1')
    expect(statuses(p)).toEqual([
      'a:complete:a1=complete,a2=complete',
      'b:complete:b1=complete',
      'c:not-started:',
      'd:not-started:d1=not-started',
    ])
  })

  it('after the Threshold: tested-out modules are optional, overrides win, and reasons appear', () => {
    const placed: Progress = {
      ...fresh(),
      threshold: {
        answers: {},
        overrides: { containers: 'wayfarer' },
        placement: { foundations: 'navigator', containers: 'pathfinder' },
        completedAt: '2026-01-01T00:00:00Z',
      },
    }
    expect(learnerLevels(placed)).toEqual({
      foundations: 2,
      containers: 0,
      kubernetes: 0,
      delivery: 0,
      observability: 0,
    })
    expect(statuses(placed).slice(0, 2)).toEqual([
      'a:not-started:a1=optional,a2=not-started',
      'b:recommended:b1=recommended',
    ])
    expect(journey(M, placed).regions[0]?.modules[0]?.reason).toMatch(/^You can test out/)
    // Everything tested out: the region is optional.
    const expert: Progress = {
      ...placed,
      threshold: {
        ...placed.threshold,
        overrides: {},
        placement: { foundations: 'pathfinder', containers: 'pathfinder' },
      },
    }
    expect(statuses(expert).slice(0, 2)).toEqual([
      'a:optional:a1=optional,a2=optional',
      'b:optional:b1=optional',
    ])
    // With nothing recommended, a module to review is next.
    const reviewOnly: Progress = {
      ...expert,
      threshold: {
        ...expert.threshold,
        placement: { foundations: 'navigator', containers: 'pathfinder' },
      },
    }
    const r = journey(
      { ...M, regions: [M.regions[0], M.regions[1]] as Manifest['regions'] },
      done(reviewOnly),
    )
    expect(r.regions[0]?.modules.map((m) => m.status)).toEqual(['optional', 'recommended'])
    // A complete region with an optional module still counts as complete.
    expect(statuses(done(placed, 'a2-0'))[0]).toBe('a:complete:a1=optional,a2=complete')
  })

  it('labels name the region, its status and its module count', () => {
    const [a, , c] = journey(M, fresh()).regions
    expect(a && regionLabel(a)).toBe('A, recommended next, 0 of 2 modules')
    expect(c && regionLabel(c)).toBe('C, not started')
  })
})
