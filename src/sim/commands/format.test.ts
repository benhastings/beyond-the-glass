import { describe, expect, it } from 'vitest'
import { humanDuration, tabwrite } from './format'

const s = 1000
const m = 60 * s
const h = 60 * m
const d = 24 * h

describe('humanDuration (kubectl AGE)', () => {
  // Cases from k8s.io/apimachinery/pkg/util/duration's tests.
  it.each([
    [-2 * s, '<invalid>'],
    [-1 * s, '0s'],
    [0, '0s'],
    [s, '1s'],
    [119 * s, '119s'],
    [2 * m, '2m'],
    [2 * m + s, '2m1s'],
    [9 * m + 59 * s, '9m59s'],
    [10 * m, '10m'],
    [179 * m, '179m'],
    [3 * h, '3h'],
    [3 * h + 30 * m, '3h30m'],
    [8 * h, '8h'],
    [47 * h + 59 * m, '47h'],
    [48 * h, '2d'],
    [48 * h + 4 * h, '2d4h'],
    [7 * d + 23 * h, '7d23h'],
    [8 * d, '8d'],
    [729 * d, '729d'],
    [2 * 365 * d, '2y'],
    [2 * 365 * d + 5 * d, '2y5d'],
    [8 * 365 * d, '8y'],
  ])('%i ms → %s', (ms, text) => {
    expect(humanDuration(ms)).toBe(text)
  })
})

describe('tabwrite (kubectl tables)', () => {
  it('pads each column to its widest cell plus 3, at least 6, and leaves the last column alone', () => {
    expect(
      tabwrite([
        ['NAME', 'READY', 'STATUS'],
        ['a', '1/1', 'Running'],
        ['a-much-longer-name', '0/1', 'CrashLoopBackOff'],
      ]),
    ).toBe(
      [
        'NAME                 READY   STATUS',
        'a                    1/1     Running',
        'a-much-longer-name   0/1     CrashLoopBackOff',
      ].join('\n'),
    )
    expect(tabwrite([])).toBe('')
  })
})
