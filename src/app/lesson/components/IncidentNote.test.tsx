import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { IncidentNote } from './IncidentNote'

afterEach(cleanup)

describe('<IncidentNote>', () => {
  it('reviews the note part by part, with tips and no score; the example can be opened', async () => {
    render(<IncidentNote example />)
    await userEvent.type(screen.getByRole('textbox', { name: /^Impact/ }), 'About 8% of sends fail')
    await userEvent.type(screen.getByRole('textbox', { name: /^Timeline/ }), 'Errors since 20:46')
    await userEvent.click(screen.getByRole('button', { name: 'Review my note' }))
    const status = screen.getByRole('status')
    const items = within(status)
      .getAllByRole('listitem')
      .map((li) => li.textContent)
    expect(items).toEqual([
      expect.stringMatching(/^✓Impact: there\.$/),
      expect.stringMatching(/^✓Timeline: there\.$/),
      expect.stringMatching(/^○Evidence: Name what you saw/),
      expect.stringMatching(/^○Hypothesis: Say what you think/),
      expect.stringMatching(/^○Next step: Say the next action/),
    ])
    expect(status.textContent).not.toMatch(/score|\d+ of 5|\d+\/5/)
    await userEvent.click(screen.getByText('An example note'))
    // The example's own next step (the tip quotes a similar sentence).
    expect(
      screen.getByText(
        'I’m reverting the release through a merge request; Sam watches the error rate.',
        { selector: 'dd' },
      ),
    ).toBeVisible()
  })
})
