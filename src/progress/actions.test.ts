import { describe, expect, it } from 'vitest'
import * as a from './actions'
import { emptyProgress, type Progress } from './schema'

const T0 = '2026-11-24T10:00:00.000Z'
const T1 = '2026-11-24T10:05:00.000Z'
const T2 = '2026-11-24T10:10:00.000Z'

describe('progress actions', () => {
  const p0 = emptyProgress(T0)

  it('never mutates the input and always moves updatedAt', () => {
    const before = structuredClone(p0)
    const p1 = a.completeStep(p0, 'l1', 's1', T1)
    expect(p0).toEqual(before)
    expect(p1.updatedAt).toBe(T1)
    expect(p1.createdAt).toBe(T0)
  })

  it('sets and clears the display name', () => {
    const named = a.setDisplayName(p0, '  Sam  ', T1)
    expect(named.displayName).toBe('Sam')
    expect('displayName' in a.setDisplayName(named, '   ', T2)).toBe(false)
    expect('displayName' in a.setDisplayName(named, undefined, T2)).toBe(false)
    expect(() => a.setDisplayName(p0, 'x'.repeat(41), T1)).toThrow()
  })

  it('records the threshold: answers, placement, overrides and start region', () => {
    let p = a.recordThresholdAnswer(p0, 'q1', 'b', T1)
    p = a.recordThresholdAnswer(p, 'q2', ['a', 'c'], T1)
    p = a.completeThreshold(p, { kubernetes: 'deckhand', containers: 'navigator' }, T2)
    expect(p.threshold).toMatchObject({
      answers: { q1: 'b', q2: ['a', 'c'] },
      placement: { kubernetes: 'deckhand', containers: 'navigator' },
      completedAt: T2,
    })
    p = a.overrideLevel(p, 'kubernetes', 'wayfarer', T2)
    expect(p.threshold.overrides).toEqual({ kubernetes: 'wayfarer' })
    p = a.overrideLevel(p, 'kubernetes', undefined, T2)
    expect(p.threshold.overrides).toEqual({})
    p = a.chooseStartRegion(p, 'harbor', T2)
    expect(p.threshold.startRegion).toBe('harbor')
    expect('startRegion' in a.chooseStartRegion(p, undefined, T2).threshold).toBe(false)
  })

  it('tracks lesson steps, completion and depth', () => {
    let p = a.goToStep(p0, 'l1', 2, T1)
    p = a.completeStep(p, 'l1', 's1', T1)
    expect(a.completeStep(p, 'l1', 's1', T2)).toBe(p)
    p = a.setDepth(p, 'l1', 'eli5', T1)
    p = a.completeLesson(p, 'l1', T1)
    expect(a.completeLesson(p, 'l1', T2)).toBe(p)
    expect(p.lessons.l1).toEqual({
      currentStep: 2,
      completedSteps: ['s1'],
      depth: 'eli5',
      completedAt: T1,
    })
    expect(a.goToStep(p0, 'l2', -3, T1).lessons.l2?.currentStep).toBe(0)
  })

  it('counts check attempts and remembers a pass', () => {
    let p = a.recordCheckAttempt(p0, 'c1', 'a', false, T1)
    p = a.recordCheckAttempt(p, 'c1', 'b', true, T1)
    p = a.recordCheckAttempt(p, 'c1', 'c', false, T2)
    expect(p.checks.c1).toEqual({ attempts: 3, passed: true, lastAnswer: 'c' })
  })

  it('updates challenges without ever un-completing them or lowering hints', () => {
    let p: Progress = a.updateChallenge(
      p0,
      'ch',
      { status: 'in-progress', commandsRun: 3, hintsUsed: 2 },
      T1,
    )
    p = a.updateChallenge(p, 'ch', { hintsUsed: 1 }, T1)
    expect(p.challenges.ch).toEqual({ status: 'in-progress', hintsUsed: 2, commandsRun: 3 })
    p = a.updateChallenge(p, 'ch', { status: 'completed', commandsRun: 5 }, T2)
    expect(p.challenges.ch).toEqual({
      status: 'completed',
      hintsUsed: 2,
      commandsRun: 5,
      completedAt: T2,
    })
    p = a.updateChallenge(p, 'ch', { status: 'in-progress' }, '2026-11-25T00:00:00.000Z')
    expect(p.challenges.ch?.status).toBe('completed')
    expect(p.challenges.ch?.completedAt).toBe(T2)
  })

  it('saves scenario state and settings', () => {
    let p = a.saveScenario(p0, 'ravenpost', { snapshot: { now: 1 }, act: 1 }, T1)
    p = a.saveScenario(p, 'ravenpost', { notes: 'check the notifier' }, T1)
    expect(p.scenarios.ravenpost).toEqual({
      snapshot: { now: 1 },
      act: 1,
      notes: 'check the notifier',
    })
    p = a.updateSettings(p, { textSize: 130 }, T2)
    expect(p.settings).toEqual({
      reduceMotion: 'system',
      highContrast: 'system',
      textSize: 130,
      updatedAt: T2,
    })
  })
})
