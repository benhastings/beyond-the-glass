import { describe, expect, it } from 'vitest'
import { emptyProgress } from './schema'
import { summarize } from './summary'

const T = '2026-11-24T10:00:00.000Z'

describe('summarize', () => {
  it('describes a record for an import preview or the lead view', () => {
    const p = {
      ...emptyProgress(T),
      displayName: 'Sam',
      threshold: {
        answers: {},
        completedAt: T,
        placement: { kubernetes: 'deckhand' as const, containers: 'navigator' as const },
        overrides: { kubernetes: 'wayfarer' as const, delivery: 'pathfinder' as const },
      },
      lessons: {
        a: { currentStep: 1, completedSteps: [], completedAt: T },
        b: { currentStep: 1, completedSteps: [] },
      },
      challenges: { c: { status: 'completed' as const, hintsUsed: 0, commandsRun: 3 } },
    }
    const outline = {
      regions: [{ id: 'harbor', modules: [{ id: 'm', lessons: [{ id: 'a', steps: [] }] }] }],
    }
    expect(summarize(p, outline)).toEqual({
      displayName: 'Sam',
      placement: { containers: 'navigator', delivery: 'pathfinder', kubernetes: 'wayfarer' },
      lessonsCompleted: 1,
      modulesTestedOut: 0,
      lessonsStarted: 1,
      challengesCompleted: 1,
      regionsCompleted: ['harbor'],
      thresholdComplete: true,
      lastActivity: T,
    })
    expect(summarize(emptyProgress(T))).toMatchObject({
      placement: {},
      regionsCompleted: [],
      thresholdComplete: false,
      displayName: undefined,
    })
  })
})
