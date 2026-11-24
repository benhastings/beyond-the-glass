import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { App, AppRoutes } from './App'

// Example component test: render with Testing Library and query by role, the way assistive technology sees it.
describe('App', () => {
  it('renders the landing heading', () => {
    render(<App />)
    expect(screen.getByRole('heading', { level: 1, name: 'Beyond the Glass' })).toBeInTheDocument()
  })

  it('renders a region route', () => {
    render(
      <MemoryRouter initialEntries={['/region/chartroom']}>
        <AppRoutes />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { level: 1, name: 'Region: chartroom' })).toBeInTheDocument()
  })

  it('renders a not-found view for unknown routes', () => {
    render(
      <MemoryRouter initialEntries={['/nowhere']}>
        <AppRoutes />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/doesn.t lead anywhere/)
  })
})
