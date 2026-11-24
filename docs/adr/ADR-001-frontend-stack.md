# ADR-001: Frontend stack

- **Status:** Accepted
- **Date:** 2026-11-23

## Context
The app is static (GitHub Pages, plus a container fallback), has no backend, and is built mostly by coding
agents working in parallel. It needs rich, accessible interactive UIs (a terminal, mock Argo CD and Grafana,
a quiz) on top of a large framework-free simulator. Every schema (progress, content, scenarios) must be
validated, both at build time and when reading untrusted input such as an imported progress code. WCAG 2.2 AA
is a launch gate.

## Decision
- **React 19 + Vite 8 + TypeScript** in strict mode with `noUncheckedIndexedAccess`.
- **TypeScript is pinned to 6.0.x** and **ESLint to 9.x**: typescript-eslint supports TypeScript `<6.1` and
  eslint-plugin-jsx-a11y supports ESLint up to 9. Lift each pin when its plugin supports the newer version.
- **Tailwind CSS 4** with design tokens as CSS variables (`src/app/styles/tokens.css`, E1-01).
- **Radix UI** primitives for dialogs, tabs, menus and other widgets whose keyboard and ARIA behavior is hard
  to get right.
- **Zustand** with its persist middleware for app state; **Zod** for every schema.
- **Vitest + Testing Library** and **Playwright + axe-core** (E0-05).
- `src/sim`, `src/placement`, `src/progress` and `src/content` are framework-free, and ESLint enforces it.

## Consequences
- Agents get a mainstream, well-documented stack: fewer invented patterns, more help from documentation.
- Radix covers the accessible behavior of common widgets; bespoke widgets (terminal, trace waterfall) still
  need their own work and tests.
- Zod schemas double as TypeScript types, so the store, content and scenarios have one definition each.
- The two version pins have to be revisited; `npm outdated` shows when.
- React's runtime is about 60 KB gzipped of the 250 KB initial-JS budget.

## Alternatives considered
- **Svelte or Solid:** smaller runtimes, but a smaller accessible-component ecosystem (no Radix equivalent of
  the same maturity), and less familiar to agents and contributors.
- **Redux Toolkit:** more ceremony than Zustand for a single-user, local-only store.
- **CSS Modules or vanilla-extract:** workable, but Tailwind with token variables gives agents one consistent
  vocabulary and keeps styles next to the markup.
- **TypeScript 7 (native):** faster, but typescript-eslint doesn't support it yet, and type-aware lint rules
  matter more here than compile speed.
