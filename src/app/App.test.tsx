import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { acTest } from '@/test/ac'
import { App } from './App'
import { loadManifest } from './content'
import { PAGES, routes } from './routes'
import { ErrorScreen } from './shell/ErrorScreen'
import { Shell } from './shell/Shell'

function at(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(<RouterProvider router={router} />)
  return router
}

const h1 = () => screen.findByRole('heading', { level: 1 })
const fullTitle = (title: string) =>
  title === 'Beyond the Glass' ? title : `${title} · Beyond the Glass`

describe('App shell', () => {
  // The manifest is a lazy chunk; load it once up front so the first test doesn't pay for it.
  beforeAll(async () => {
    await loadManifest()
  })

  it('renders the Console Room at the hash root', async () => {
    render(<App />)
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Beyond the Glass' }),
    ).toBeInTheDocument()
    await waitFor(() => {
      expect(document.title).toBe('Beyond the Glass')
    })
  })

  it('has a skip link, banner, main navigation, main and contentinfo landmarks', async () => {
    at('/')
    await h1()
    expect(screen.getByRole('link', { name: 'Skip to main content' })).toBeInTheDocument()
    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument()
    expect(screen.getByRole('main')).toBeInTheDocument()
    expect(screen.getByRole('contentinfo')).toBeInTheDocument()
  })

  it('the skip link moves focus to main without changing the route', async () => {
    const router = at('/map')
    await h1()
    await userEvent.click(screen.getByRole('link', { name: 'Skip to main content' }))
    expect(screen.getByRole('main')).toHaveFocus()
    expect(router.state.location.pathname).toBe('/map')
  })

  it.each([
    ['/', 'Beyond the Glass'],
    ['/threshold', 'The Threshold'],
    ['/threshold/results', 'Your trail'],
    ['/map', 'Map of the Reach'],
    ['/region/chartroom', 'The Chartroom'],
    ['/guide', 'Field Guide'],
    ['/settings', 'Settings'],
    ['/lead', 'Lead view'],
    ['/stormwatch', 'Stormwatch'],
  ])('%s has one h1 (%s) and a matching unique title', async (path, title) => {
    at(path)
    expect(await screen.findByRole('heading', { level: 1, name: title })).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    await waitFor(() => {
      expect(document.title).toBe(fullTitle(title))
    })
  })

  acTest(
    'E2-01.AC3',
    'unknown routes, regions, lessons and terms render the 404 view with a link home',
    async () => {
      for (const path of [
        '/nowhere',
        '/region/no-such-region',
        '/lesson/nope',
        '/guide/nope',
        '/a/b/c',
      ]) {
        const { unmount } = render(
          <RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />,
        )
        expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(
          "This path doesn't lead anywhere yet",
        )
        expect(screen.getByRole('link', { name: 'Back to the Console Room' })).toHaveAttribute(
          'href',
          '/',
        )
        unmount()
      }
    },
  )

  it('moves focus to the new h1 and announces the page after navigating, but not on first load', async () => {
    at('/')
    const first = await h1()
    expect(first).not.toHaveFocus()
    await userEvent.click(screen.getByRole('link', { name: 'Map' }))
    const heading = await screen.findByRole('heading', { level: 1, name: 'Map of the Reach' })
    await waitFor(() => {
      expect(heading).toHaveFocus()
    })
    await waitFor(() => {
      expect(screen.getByTestId('route-announcer')).toHaveTextContent('Map of the Reach')
    })
    expect(screen.getByRole('link', { name: 'Map' })).toHaveAttribute('aria-current', 'page')
  })

  it('a page that throws shows the recovery screen inside the shell', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const Boom = () => {
      throw new Error('kaboom')
    }
    const broken: RouteObject[] = [
      {
        path: '/',
        Component: Shell,
        children: [
          { errorElement: <ErrorScreen />, children: [{ path: 'boom', Component: Boom }] },
        ],
      },
    ]
    render(<RouterProvider router={createMemoryRouter(broken, { initialEntries: ['/boom'] })} />)
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Something went wrong' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to the Console Room' })).toBeInTheDocument()
    expect(screen.getByText('kaboom')).toBeInTheDocument()
    spy.mockRestore()
  })

  it('a shell failure shows the bare recovery screen', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const Boom = () => {
      throw new Error('shell down')
    }
    const broken: RouteObject[] = [
      { path: '/', Component: Boom, errorElement: routes[0]?.errorElement },
    ]
    render(<RouterProvider router={createMemoryRouter(broken, { initialEntries: ['/'] })} />)
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Something went wrong' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
    spy.mockRestore()
  })

  it('registers every route the plan lists', () => {
    expect(PAGES.map((p) => (p.index ? '/' : `/${p.path ?? ''}`))).toEqual([
      '/',
      '/threshold',
      '/threshold/results',
      '/map',
      '/region/:regionId',
      '/lesson/:lessonId/:step?',
      // Added by E4-05 (module test-outs), after the E2-01 route list was written.
      '/test-out/:regionId/:moduleId',
      '/guide',
      '/guide/:term',
      '/settings',
      '/lead',
      '/stormwatch',
      // Added by E2-07 (printable field cards).
      '/field-cards/:card?',
      '/kitchen-sink',
      '/*',
    ])
  })

  it('shows the progress indicator once content loads', async () => {
    at('/')
    expect(await screen.findByTestId('progress-indicator')).toHaveTextContent(
      /0 of 7 regions complete/,
    )
  })
})
