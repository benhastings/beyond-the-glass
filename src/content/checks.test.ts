import { describe, expect } from 'vitest'
import { acTest } from '@/test/ac'
import { checkSchema, grade, stableShuffle, type CheckInput } from './checks'

const parse = (c: { type: CheckInput['type'] } & Record<string, unknown>) =>
  checkSchema.parse({ id: 'c', prompt: 'P?', explanation: 'Because.', ...c })

describe('E5-03 grading', () => {
  acTest(
    'E5-03.AC4',
    'single choice: the correct option passes, others give their feedback',
    () => {
      const c = parse({
        type: 'single',
        options: [
          { id: 'a', text: 'A', correct: true, feedback: 'Yes, A.' },
          { id: 'b', text: 'B', feedback: 'B restarts nothing.' },
          { id: 'c', text: 'C' },
        ],
      })
      expect(grade(c, 'a')).toEqual({ passed: true, feedback: ['Yes, A.'] })
      expect(grade(c, 'b')).toEqual({ passed: false, feedback: ['B restarts nothing.'] })
      expect(grade(c, 'c')).toEqual({
        passed: false,
        feedback: ['Not that one. Have another look.'],
      })
      expect(grade(c, 'zzz').passed).toBe(false)
      expect(() =>
        parse({
          type: 'single',
          options: [
            { id: 'a', text: 'A' },
            { id: 'b', text: 'B' },
          ],
        }),
      ).toThrow(/exactly one/)
    },
  )

  acTest(
    'E5-03.AC4',
    'multiple select: passes only with exactly the right set, and says what is missing',
    () => {
      const c = parse({
        type: 'multiple',
        options: [
          { id: 'a', text: 'A', correct: true },
          { id: 'b', text: 'B', correct: true },
          { id: 'c', text: 'C', feedback: 'C is a node thing.' },
        ],
      })
      expect(grade(c, ['a', 'b'])).toEqual({ passed: true, feedback: ['That’s all of them.'] })
      expect(grade(c, ['b', 'a']).passed).toBe(true)
      expect(grade(c, ['a'])).toEqual({ passed: false, feedback: ['1 more option applies.'] })
      expect(grade(c, ['a', 'b', 'c'])).toEqual({ passed: false, feedback: ['C is a node thing.'] })
      expect(grade(c, []).feedback).toEqual(['Choose every option that applies.'])
    },
  )

  acTest(
    'E5-03.AC4',
    'ordering: passes in the right order, otherwise counts the items in place',
    () => {
      const c = parse({
        type: 'ordering',
        items: ['look', 'logs', 'fix', 'verify'].map((id) => ({ id, text: id })),
      })
      expect(grade(c, ['look', 'logs', 'fix', 'verify']).passed).toBe(true)
      expect(grade(c, ['logs', 'look', 'fix', 'verify'])).toEqual({
        passed: false,
        feedback: ['2 of 4 are in the right place.'],
      })
      expect(grade(c, ['look', 'logs']).feedback).toEqual(['Put every step in the list in order.'])
    },
  )

  acTest('E5-03.AC4', 'matching: every pair must match', () => {
    const c = parse({
      type: 'matching',
      pairs: [
        { id: 'systemctl', left: 'systemctl restart', right: 'kubectl rollout restart' },
        { id: 'journalctl', left: 'journalctl', right: 'kubectl logs' },
        { id: 'ps', left: 'ps', right: 'kubectl get pods' },
      ],
    })
    expect(grade(c, ['systemctl=systemctl', 'journalctl=journalctl', 'ps=ps']).passed).toBe(true)
    expect(grade(c, ['systemctl=journalctl', 'journalctl=systemctl', 'ps=ps'])).toEqual({
      passed: false,
      feedback: ['1 of 3 matches are right.'],
    })
    expect(grade(c, ['ps=ps']).feedback).toEqual(['Match every item.'])
  })

  acTest(
    'E5-03.AC4',
    'spot-the-bug: the bug line passes; other lines get their own feedback',
    () => {
      const c = parse({
        type: 'spot-the-bug',
        code: 'apiVersion: apps/v1\nkind: Deployment\nspec:\n  replicas: "three"\n',
        bugLines: [4],
        lineFeedback: { '2': 'Deployment is the right kind.' },
      })
      expect(grade(c, '4')).toEqual({ passed: true, feedback: ['That’s the line.'] })
      expect(grade(c, '2')).toEqual({ passed: false, feedback: ['Deployment is the right kind.'] })
      expect(grade(c, '1')).toEqual({ passed: false, feedback: ['Line 1 is fine. Keep looking.'] })
      expect(grade(c, '9').feedback).toEqual(['Choose the line with the bug.'])
    },
  )

  acTest('E5-03.AC4', 'shuffled display order is stable and never the answer order', () => {
    const items = ['a', 'b', 'c', 'd']
    expect(stableShuffle('x', items)).toEqual(stableShuffle('x', items))
    for (const seed of ['a', 'b', 'c', 'd', 'e', 'f']) {
      const s = stableShuffle(seed, items)
      expect([...s].sort()).toEqual(items)
      expect(s).not.toEqual(items)
    }
    expect(stableShuffle('x', ['only'])).toEqual(['only'])
  })
})
