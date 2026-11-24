import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { App } from './App'

// Example component test: render with Testing Library and query by role, the way assistive technology sees it.
describe('App', () => {
  it('renders the landing heading', () => {
    render(<App />)
    expect(screen.getByRole('heading', { level: 1, name: 'Beyond the Glass' })).toBeInTheDocument()
  })
})
