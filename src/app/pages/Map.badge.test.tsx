import { cleanup, render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useProgress } from '../progress'
import JourneyMap from './Map'

vi.mock('../content', () => ({ useManifest: () => ({ glossary: [], regions: [] }) }))
afterEach(cleanup)

const show = () =>
  render(
    <RouterProvider
      router={createMemoryRouter([{ path: '*', element: <JourneyMap /> }], {
        initialEntries: ['/map'],
      })}
    />,
  )

describe('E10-05 the Long Night badge', () => {
  it('appears on the map once the capstone is finished, and links to the debrief', () => {
    show()
    expect(screen.queryByRole('heading', { name: 'Badges' })).toBeNull()
    cleanup()
    useProgress
      .getState()
      .saveScenario('the-long-night', { completedAt: '2026-11-26T00:00:00.000Z' })
    show()
    expect(screen.getByRole('region', { name: 'Badges' })).toHaveTextContent(
      'The Long Night: you saw Stormwatch through the storm.',
    )
    expect(screen.getByRole('link', { name: 'Read your debrief' })).toHaveAttribute(
      'href',
      '/stormwatch',
    )
  })
})
