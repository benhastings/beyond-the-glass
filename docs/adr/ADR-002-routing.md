# ADR-002: Routing on GitHub Pages

- **Status:** Accepted
- **Date:** 2026-11-23

## Context
GitHub Pages serves static files and can't rewrite unknown paths to `index.html`: a hard refresh of
`/beyond-the-glass/region/chartroom` returns 404. The same `dist/` must also run at `/` in the container
(E0-09), under any other prefix, and from a file share in an air-gapped network. Deep links into lessons
must survive a refresh and a copy-paste.

## Decision
- **React Router's `HashRouter`**: routes live after `#` (`/#/region/chartroom`), so the server only ever
  serves `index.html`.
- **`base: './'`** in Vite, so every asset URL is relative (E0-01.AC3 tests the build under three prefixes).
- A small `404.html` redirects any old path-style link to its hash equivalent (E0-03).
- Code never builds a URL from a hard-coded base path; links are route-relative.

## Consequences
- Deep links and refresh work on GitHub Pages, in the container and from a static file server, with no
  server configuration.
- URLs contain `#/`, which is less tidy and means in-page anchors can't use the plain fragment. Headings use
  router-aware links instead.
- Servers never see the route, so there are no server-side analytics, which we don't want anyway.

## Alternatives considered
- **`BrowserRouter` plus the `404.html` single-page-app trick:** GitHub Pages serves the redirect with a 404
  status, so crawlers and some proxies treat every deep link as missing. It also needs the base path baked in.
- **Pre-rendering every route to its own `index.html`:** works for content pages, not for dynamic routes
  such as `#/lead/<code>`, and adds a build step per route.
- **A custom server:** rules out GitHub Pages, our primary host.
