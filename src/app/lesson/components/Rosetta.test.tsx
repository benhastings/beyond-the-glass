import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Rosetta } from './Rosetta'

vi.mock('../../content', () => ({
  useManifest: () => ({
    glossary: [],
    regions: [],
    rosetta: [
      { id: 'server-node', then: 'A server', now: 'A node', why: 'Cattle, not pets.', terms: [] },
    ],
  }),
}))
afterEach(cleanup)

describe('<Rosetta>', () => {
  it('shows the entry as then, now and why, labelled as from the Rosetta Stone', () => {
    render(<Rosetta id="server-node" />)
    const box = screen.getByRole('complementary', { name: 'From the Rosetta Stone' })
    expect(within(box).getByText('Then').nextSibling).toHaveTextContent('A server')
    expect(within(box).getByText('Now').nextSibling).toHaveTextContent('A node')
    expect(within(box).getByText('Why it changed').nextSibling).toHaveTextContent(
      'Cattle, not pets.',
    )
  })

  it('renders nothing for an id the build would have rejected', () => {
    expect(render(<Rosetta id="nope" />).container.innerHTML).toBe('')
  })
})
