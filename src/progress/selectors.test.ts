import { describe, expect } from 'vitest'
import { acTest } from '@/test/ac'
import * as a from './actions'
import { emptyProgress } from './schema'
import {
  challengesCompleted,
  completedRegions,
  lessonStatus,
  levelFor,
  moduleCompletion,
  nextRecommendedStep,
  regionCompletion,
  thresholdComplete,
  totalHintsUsed,
  type CourseOutline,
} from './selectors'

const T = '2026-11-24T10:00:00.000Z'
const outline: CourseOutline = {
  regions: [
    {
      id: 'console-room',
      modules: [{ id: 'noc', lessons: [{ id: 'cr-1', steps: ['a', 'b'] }] }],
    },
    {
      id: 'harbor',
      modules: [
        {
          id: 'containers',
          lessons: [
            { id: 'hb-1', steps: ['a'] },
            { id: 'hb-2', steps: ['a', 'b', 'c'] },
          ],
        },
        { id: 'images', lessons: [{ id: 'hb-3', steps: ['a'] }] },
      ],
    },
    { id: 'empty', modules: [] },
  ],
}

describe('progress selectors', () => {
  const p0 = emptyProgress(T)

  acTest('E3-01.AC2', 'lessonStatus: not started, in progress, completed', () => {
    expect(lessonStatus(p0, 'cr-1')).toBe('not-started')
    expect(lessonStatus(a.goToStep(p0, 'cr-1', 0, T), 'cr-1')).toBe('not-started')
    expect(lessonStatus(a.goToStep(p0, 'cr-1', 1, T), 'cr-1')).toBe('in-progress')
    expect(lessonStatus(a.completeStep(p0, 'cr-1', 'a', T), 'cr-1')).toBe('in-progress')
    expect(lessonStatus(a.completeLesson(p0, 'cr-1', T), 'cr-1')).toBe('completed')
  })

  acTest('E3-01.AC2', 'regionCompletion and moduleCompletion are whole percentages', () => {
    const p = a.completeLesson(p0, 'hb-1', T)
    expect(regionCompletion(p, outline, 'harbor')).toBe(33)
    expect(moduleCompletion(p, outline, 'harbor', 'containers')).toBe(50)
    expect(moduleCompletion(p, outline, 'harbor', 'images')).toBe(0)
    expect(regionCompletion(p, outline, 'console-room')).toBe(0)
    expect(regionCompletion(p, outline, 'empty')).toBe(0)
    expect(regionCompletion(p, outline, 'nowhere')).toBe(0)
    expect(moduleCompletion(p, outline, 'nowhere', 'x')).toBe(0)
    const all = ['hb-1', 'hb-2', 'hb-3'].reduce((q, id) => a.completeLesson(q, id, T), p0)
    expect(regionCompletion(all, outline, 'harbor')).toBe(100)
    expect(completedRegions(all, outline)).toEqual(['harbor'])
    expect(completedRegions(p0, outline)).toEqual([])
  })

  acTest('E3-01.AC2', 'levelFor prefers the learner’s override to the placement', () => {
    expect(levelFor(p0, 'kubernetes')).toBeUndefined()
    let p = a.completeThreshold(p0, { kubernetes: 'navigator' }, T)
    expect(thresholdComplete(p0)).toBe(false)
    expect(thresholdComplete(p)).toBe(true)
    expect(levelFor(p, 'kubernetes')).toBe('navigator')
    p = a.overrideLevel(p, 'kubernetes', 'wayfarer', T)
    expect(levelFor(p, 'kubernetes')).toBe('wayfarer')
  })

  acTest(
    'E3-01.AC2',
    'nextRecommendedStep resumes in-progress lessons and honours the start region',
    () => {
      expect(nextRecommendedStep(p0, outline)).toEqual({
        regionId: 'console-room',
        moduleId: 'noc',
        lessonId: 'cr-1',
        step: 0,
      })
      let p = a.goToStep(p0, 'cr-1', 1, T)
      expect(nextRecommendedStep(p, outline)).toMatchObject({ lessonId: 'cr-1', step: 1 })
      // A stale step index beyond the lesson's end is clamped to its last step.
      expect(nextRecommendedStep(a.goToStep(p0, 'cr-1', 9, T), outline)?.step).toBe(1)
      p = a.chooseStartRegion(p, 'harbor', T)
      expect(nextRecommendedStep(p, outline)).toMatchObject({
        regionId: 'harbor',
        lessonId: 'hb-1',
      })
      p = ['hb-1', 'hb-2', 'hb-3'].reduce((q, id) => a.completeLesson(q, id, T), p)
      // Harbor is done, so it wraps round to what was skipped.
      expect(nextRecommendedStep(p, outline)).toMatchObject({
        regionId: 'console-room',
        lessonId: 'cr-1',
        step: 1,
      })
      p = a.completeLesson(p, 'cr-1', T)
      expect(nextRecommendedStep(p, outline)).toBeUndefined()
      expect(nextRecommendedStep(a.chooseStartRegion(p0, 'nowhere', T), outline)?.lessonId).toBe(
        'cr-1',
      )
    },
  )

  acTest('E3-01.AC2', 'challenge totals', () => {
    let p = a.updateChallenge(p0, 'a', { status: 'completed', hintsUsed: 1 }, T)
    p = a.updateChallenge(p, 'b', { status: 'in-progress', hintsUsed: 2 }, T)
    expect(challengesCompleted(p)).toBe(1)
    expect(totalHintsUsed(p)).toBe(3)
    expect(challengesCompleted(p0)).toBe(0)
  })
})
