import { describe, expect, it } from 'vitest'
import { LESSON_COMPONENT_NAMES } from '@/content/components'
import { LESSON_COMPONENTS } from './index'

describe('lesson components', () => {
  it('the content build knows exactly the components the registry provides', () => {
    expect(Object.keys(LESSON_COMPONENTS).sort()).toEqual([...LESSON_COMPONENT_NAMES].sort())
  })
})
