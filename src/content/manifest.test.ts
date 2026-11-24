import manifest from 'virtual:btg-content'
import { describe, expect, it } from 'vitest'
import { courseOutline, findLesson, findModule, findRegion, allLessons } from './manifest'
import type { Manifest } from './schema'

const fixture: Manifest = {
  glossary: [],
  regions: [
    {
      id: 'r',
      title: 'R',
      summary: 's',
      mood: 'reach',
      estimatedMinutes: 10,
      modules: [
        {
          id: 'm',
          regionId: 'r',
          title: 'M',
          summary: 's',
          domain: 'kubernetes',
          estimatedMinutes: 10,
          lessons: [
            {
              id: 'l',
              regionId: 'r',
              moduleId: 'm',
              title: 'L',
              objectives: ['o'],
              estimatedMinutes: 10,
              domain: 'kubernetes',
              level: 'wayfarer',
              prerequisites: [],
              terms: [],
              steps: [{ id: 'a' }, { id: 'b', title: 'B' }],
              file: 'x.mdx',
            },
          ],
        },
      ],
    },
  ],
}

describe('manifest helpers', () => {
  it('finds regions, modules and lessons', () => {
    expect(findRegion(fixture, 'r')?.title).toBe('R')
    expect(findModule(fixture, 'r', 'm')?.title).toBe('M')
    expect(findModule(fixture, 'x', 'm')).toBeUndefined()
    expect(findLesson(fixture, 'l')?.title).toBe('L')
    expect(findLesson(fixture, 'nope')).toBeUndefined()
    expect(allLessons(fixture).map((l) => l.id)).toEqual(['l'])
  })

  it('gives the progress selectors their course outline', () => {
    expect(courseOutline(fixture)).toEqual({
      regions: [{ id: 'r', modules: [{ id: 'm', lessons: [{ id: 'l', steps: ['a', 'b'] }] }] }],
    })
  })

  it('serves the real content as virtual:btg-content, regions in journey order', () => {
    expect(manifest.regions.map((r) => r.id)).toEqual([
      'console-room',
      'harbor',
      'helm-keep',
      'chartroom',
      'mirror-lake',
      'signalwood',
      'stormwatch',
    ])
    expect(manifest.regions.map((r) => r.mood)).toEqual([
      'console',
      'reach',
      'reach',
      'reach',
      'reach',
      'reach',
      'stormwatch',
    ])
  })
})
