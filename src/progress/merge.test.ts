import { describe, expect } from 'vitest'
import { acTest } from '@/test/ac'
import { mergeChallenge, mergeCheck, mergeLesson, mergeProgress, mergeScenario } from './merge'
import { emptyProgress, type Progress } from './schema'

const T = (n: number) => `2026-11-${String(n).padStart(2, '0')}T10:00:00.000Z`
const NOW = T(30)

describe('merging an imported record', () => {
  acTest(
    'E3-03.AC4',
    'a completed lesson beats an in-progress one; otherwise steps are combined',
    () => {
      const done = { currentStep: 4, completedSteps: ['a', 'b', 'c', 'd', 'e'], completedAt: T(5) }
      const midway = { currentStep: 1, completedSteps: ['a', 'x'], depth: 'eli5' as const }
      expect(mergeLesson(done, midway)).toBe(done)
      expect(mergeLesson(midway, done)).toBe(done)
      expect(mergeLesson(midway, { currentStep: 3, completedSteps: ['b'] })).toEqual({
        currentStep: 3,
        completedSteps: ['a', 'x', 'b'],
        depth: 'eli5',
      })
      expect(mergeLesson({ ...done, completedAt: T(9) }, done)).toEqual(done)
    },
  )

  acTest(
    'E3-03.AC4',
    'a completed challenge beats an in-progress one, and counts keep the larger value',
    () => {
      expect(
        mergeChallenge(
          { status: 'in-progress', hintsUsed: 3, commandsRun: 9 },
          { status: 'completed', hintsUsed: 1, commandsRun: 4, completedAt: T(3) },
        ),
      ).toEqual({ status: 'completed', hintsUsed: 3, commandsRun: 9, completedAt: T(3) })
      expect(
        mergeChallenge(
          { status: 'not-started', hintsUsed: 0, commandsRun: 0 },
          { status: 'in-progress', hintsUsed: 0, commandsRun: 2 },
        ),
      ).toEqual({
        status: 'in-progress',
        hintsUsed: 0,
        commandsRun: 2,
      })
      expect(
        mergeCheck(
          { attempts: 3, passed: false, lastAnswer: 'a' },
          { attempts: 1, passed: true, lastAnswer: 'b' },
        ),
      ).toEqual({
        attempts: 3,
        passed: true,
        lastAnswer: 'a',
      })
      expect(mergeCheck({ attempts: 1, passed: false }, { attempts: 2, passed: false })).toEqual({
        attempts: 2,
        passed: false,
      })
    },
  )

  acTest('E3-03.AC4', 'the later timestamp wins for settings and for the placement', () => {
    const local: Progress = {
      ...emptyProgress(T(1)),
      settings: { reduceMotion: 'on', highContrast: 'system', textSize: 130, updatedAt: T(10) },
      threshold: {
        answers: { q: 'a' },
        overrides: {},
        placement: { kubernetes: 'deckhand' },
        completedAt: T(2),
      },
    }
    const newer: Progress = {
      ...emptyProgress(T(3)),
      settings: { reduceMotion: 'off', highContrast: 'on', textSize: 100, updatedAt: T(12) },
      threshold: {
        answers: { q: 'b' },
        overrides: {},
        placement: { kubernetes: 'navigator' },
        completedAt: T(4),
      },
    }
    expect(mergeProgress(local, newer, NOW).settings).toEqual(newer.settings)
    expect(mergeProgress(newer, local, NOW).settings).toEqual(newer.settings)
    expect(mergeProgress(local, newer, NOW).threshold).toEqual(newer.threshold)
    expect(mergeProgress(newer, local, NOW).threshold).toEqual(newer.threshold)
    // Settings never changed on one side: the side that did change them wins.
    const untouched = {
      ...newer,
      settings: {
        reduceMotion: 'system' as const,
        highContrast: 'system' as const,
        textSize: 100 as const,
      },
    }
    expect(mergeProgress(untouched, local, NOW).settings).toEqual(local.settings)
    // A finished Threshold beats an unfinished one.
    expect(mergeProgress(emptyProgress(T(1)), local, NOW).threshold).toEqual(local.threshold)
    expect(mergeProgress(local, emptyProgress(T(1)), NOW).threshold).toEqual(local.threshold)
  })

  acTest(
    'E3-03.AC4',
    'mergeProgress keeps every item from both sides and never changes its inputs',
    () => {
      const a: Progress = {
        ...emptyProgress(T(2)),
        displayName: 'Sam',
        lessons: { l1: { currentStep: 1, completedSteps: ['s'] } },
        checks: { c1: { attempts: 1, passed: false } },
        challenges: { x: { status: 'in-progress', hintsUsed: 1, commandsRun: 2 } },
        scenarios: { ravenpost: { snapshot: { now: 5 }, act: 1 } },
      }
      const b: Progress = {
        ...emptyProgress(T(1)),
        displayName: 'Other',
        lessons: {
          l1: { currentStep: 0, completedSteps: [], completedAt: T(4) },
          l2: { currentStep: 2, completedSteps: [] },
        },
        checks: { c2: { attempts: 1, passed: true } },
        challenges: { y: { status: 'completed', hintsUsed: 0, commandsRun: 3, completedAt: T(5) } },
        scenarios: { ravenpost: { act: 3, notes: 'from the laptop' } },
      }
      const before = structuredClone([a, b])
      const m = mergeProgress(a, b, NOW)
      expect([a, b]).toEqual(before)
      expect(m.createdAt).toBe(T(1))
      expect(m.updatedAt).toBe(NOW)
      expect(m.displayName).toBe('Sam')
      expect(Object.keys(m.lessons).sort()).toEqual(['l1', 'l2'])
      expect(m.lessons.l1?.completedAt).toBe(T(4))
      expect(Object.keys(m.checks).sort()).toEqual(['c1', 'c2'])
      expect(Object.keys(m.challenges).sort()).toEqual(['x', 'y'])
      expect(m.scenarios.ravenpost).toEqual({
        snapshot: { now: 5 },
        act: 3,
        notes: 'from the laptop',
      })
      expect(mergeProgress({ ...a, displayName: undefined }, b, NOW).displayName).toBe('Other')
      expect('displayName' in mergeProgress(emptyProgress(T(1)), emptyProgress(T(1)), NOW)).toBe(
        false,
      )
    },
  )

  acTest(
    'E3-03.AC4',
    'scenario state: this browser keeps its snapshot, the further act wins',
    () => {
      expect(mergeScenario({}, { snapshot: 1 })).toEqual({ snapshot: 1 })
      expect(mergeScenario({ notes: 'mine' }, { notes: 'theirs', act: 0 })).toEqual({
        notes: 'mine',
        act: 0,
      })
      expect(mergeScenario({}, {})).toEqual({})
    },
  )
})
