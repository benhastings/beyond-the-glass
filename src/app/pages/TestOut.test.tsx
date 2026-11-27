import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { parse as parseYaml } from 'yaml'
import { beforeEach, describe, expect, vi } from 'vitest'
import { acTest } from '@/test/ac'
import { testOutFile, type TestOutCheck } from '@/content/checks'
import type { Manifest } from '@/content'
import testOutYaml from '../../../content/regions/chartroom/first-look/test-out.yaml?raw'
import { emptyProgress, summarize, encodeProgress } from '@/progress'
import { readCodes } from '../lead/LeadPanel'
import { useProgress } from '../progress'
import TestOut from './TestOut'

// The module's first three questions, all on the one lesson this test's manifest has (E9-05 added more).
const CHECKS: TestOutCheck[] = testOutFile
  .parse(parseYaml(testOutYaml))
  .checks.filter((c) => c.review.lesson === 'your-first-look')
const MANIFEST: Manifest = {
  glossary: [],
  regions: [
    {
      id: 'chartroom',
      title: 'The Chartroom',
      summary: 's',
      mood: 'reach',
      estimatedMinutes: 15,
      modules: [
        {
          id: 'first-look',
          regionId: 'chartroom',
          title: 'A first look',
          summary: 's',
          domain: 'kubernetes',
          estimatedMinutes: 15,
          testOut: CHECKS,
          lessons: [
            {
              id: 'your-first-look',
              regionId: 'chartroom',
              moduleId: 'first-look',
              title: 'Your first look at the cluster',
              objectives: ['o'],
              estimatedMinutes: 15,
              domain: 'kubernetes',
              level: 'wayfarer',
              prerequisites: [],
              terms: [],
              file: 'x.mdx',
              checks: [],
              challenges: [],
              steps: [
                { id: 'where-you-are', title: 'Where you are' },
                { id: 'ask', title: 'Ask the cluster' },
                { id: 'find-it', title: 'Find the one that isn’t running' },
                { id: 'check' },
              ],
            },
          ],
        },
      ],
    },
  ],
}
vi.mock('../content', () => ({ useManifest: () => MANIFEST }))
vi.mock('../shell/Page', () => ({
  Page: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}))

const open = () => {
  cleanup()
  const router = createMemoryRouter(
    [{ path: '/test-out/:regionId/:moduleId', Component: TestOut }],
    { initialEntries: ['/test-out/chartroom/first-look'] },
  )
  render(<RouterProvider router={router} />)
  return userEvent.setup()
}
const answer = async (user: ReturnType<typeof userEvent.setup>, rightCount: number) => {
  for (const [i, c] of CHECKS.entries()) {
    if (c.type !== 'single') throw new Error('fixture')
    const option =
      i < rightCount ? c.options.find((o) => o.correct) : c.options.find((o) => !o.correct)
    await user.click(screen.getByRole('radio', { name: option?.text }))
  }
  await user.click(screen.getByRole('button', { name: 'Check my answers' }))
}

describe('E4-05 test-out', () => {
  beforeEach(() => {
    useProgress.getState().reset()
  })

  acTest(
    'E4-05.AC2',
    'passing needs 80%; failing lists what to review with links to the steps',
    async () => {
      let user = open()
      // 2 of 3 is 67%: not enough.
      await answer(user, 2)
      expect(
        screen.getByText('2 of 3 right. Worth a look before you test out:'),
      ).toBeInTheDocument()
      expect(
        screen.getByRole('link', {
          name: 'Review “Find the one that isn’t running” in Your first look at the cluster',
        }),
      ).toHaveAttribute('href', '/lesson/your-first-look/3')
      expect(useProgress.getState().progress.testedOut).toBeUndefined()
      // All right: tested out.
      user = open()
      await answer(user, 3)
      expect(
        screen.getByText('3 of 3 right: you’ve tested out of A first look.'),
      ).toBeInTheDocument()
      expect(Object.keys(useProgress.getState().progress.testedOut ?? {})).toEqual([
        'chartroom/first-look',
      ])
      open()
      expect(screen.getByText('You’ve tested out of this module.')).toBeInTheDocument()
    },
  )

  acTest('E4-05.AC3', 'the lead view shows tested out apart from completed', async () => {
    const at = '2026-11-25T10:00:00.000Z'
    const p = { ...emptyProgress(at), testedOut: { 'chartroom/first-look': at } }
    expect(summarize(p)).toMatchObject({ modulesTestedOut: 1, lessonsCompleted: 0 })
    const r = await readCodes(await encodeProgress(p, { compress: false }), MANIFEST, at)
    expect(r.rows[0]?.summary).toMatchObject({
      modulesTestedOut: 1,
      lessonsCompleted: 0,
      regionsCompleted: [],
    })
  })
})
