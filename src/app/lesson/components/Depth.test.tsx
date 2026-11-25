import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect } from 'vitest'
import { acTest } from '@/test/ac'
import { LEVELS, type Level } from '@/progress'
import { useProgress } from '../../progress'
import { LessonContext } from '../lesson-context'
import { DeepDive } from './DeepDive'
import { Depth, DEPTH_FOR_LEVEL } from './Depth'
import { ELI5 } from './ELI5'
import { Operator } from './Operator'

const show = (layers: ('eli5' | 'operator' | 'deep')[] = ['eli5', 'operator', 'deep']) => {
  cleanup()
  render(
    <LessonContext value={{ domain: 'kubernetes' }}>
      <Depth>
        {layers.includes('eli5') && <ELI5>plain words</ELI5>}
        {layers.includes('operator') && <Operator>operator view</Operator>}
        {layers.includes('deep') && <DeepDive>all the detail</DeepDive>}
      </Depth>
    </LessonContext>,
  )
  return userEvent.setup()
}
const selected = () =>
  screen.getAllByRole('tab').find((t) => t.getAttribute('aria-selected') === 'true')?.textContent
const setLevel = (level: Level | undefined) => {
  useProgress.getState().reset()
  if (level) useProgress.getState().completeThreshold({ kubernetes: level })
}

describe('E5-05 depth layers', () => {
  beforeEach(() => {
    useProgress.getState().reset()
  })

  acTest('E5-05.AC1', 'the layers follow the WAI-ARIA tabs pattern', async () => {
    const user = show()
    const list = screen.getByRole('tablist', { name: 'How deep to go' })
    expect(list).toBeInTheDocument()
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual([
      'In plain words',
      'Operator',
      'Deep dive',
    ])
    await user.tab()
    expect(screen.getByRole('tab', { name: 'Operator' })).toHaveFocus()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Deep dive' })).toHaveFocus()
    expect(screen.getByRole('tabpanel')).toHaveTextContent('all the detail')
    await user.keyboard('{Home}')
    expect(screen.getByRole('tab', { name: 'In plain words' })).toHaveFocus()
    expect(screen.getByRole('tabpanel')).toHaveTextContent('plain words')
    await user.keyboard('{End}')
    expect(screen.getByRole('tab', { name: 'Deep dive' })).toHaveFocus()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'In plain words' })).toHaveFocus()
  })

  for (const level of LEVELS)
    acTest('E5-05.AC3', `a ${level} starts on the ${DEPTH_FOR_LEVEL[level]} layer`, () => {
      setLevel(level)
      show()
      expect(selected()).toBe(
        { eli5: 'In plain words', operator: 'Operator', deep: 'Deep dive' }[DEPTH_FOR_LEVEL[level]],
      )
    })

  acTest(
    'E5-05.AC3',
    'with no placement it starts on Operator; an override beats the placement',
    () => {
      setLevel(undefined)
      show()
      expect(selected()).toBe('Operator')
      setLevel('wayfarer')
      useProgress.getState().overrideLevel('kubernetes', 'pathfinder')
      show()
      expect(selected()).toBe('Deep dive')
    },
  )

  acTest(
    'E5-05.AC3',
    'remembers the last choice per domain, and falls back when a layer is missing',
    async () => {
      setLevel('wayfarer')
      const user = show()
      expect(selected()).toBe('In plain words')
      await user.click(screen.getByRole('tab', { name: 'Deep dive' }))
      expect(useProgress.getState().progress.settings.depthByDomain).toEqual({ kubernetes: 'deep' })
      show()
      expect(selected()).toBe('Deep dive')
      // Deep dive missing here: the nearest layer below isn't offered, so the last one available is used.
      show(['eli5', 'operator'])
      expect(selected()).toBe('Operator')
      useProgress.getState().updateSettings({ depthByDomain: { kubernetes: 'eli5' } })
      show(['operator', 'deep'])
      expect(selected()).toBe('Operator')
    },
  )
})
