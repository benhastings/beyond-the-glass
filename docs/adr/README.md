# Architecture Decision Records

One file per decision, numbered in order. Copy [`template.md`](template.md), and keep the four sections:
Context, Decision, Consequences, Alternatives considered (`tests/repo/adr.test.ts` checks them).

To reverse a decision, write a new ADR that supersedes it, and set the old one's status to
`Superseded by ADR-NNN`. Don't rewrite an accepted record.

| ADR | Decision | Status |
|---|---|---|
| [ADR-001](ADR-001-frontend-stack.md) | React, Vite, TypeScript, Tailwind, Radix, Zustand, Zod | Accepted |
| [ADR-002](ADR-002-routing.md) | HashRouter and a relative base on GitHub Pages | Accepted |
| [ADR-003](ADR-003-progress-persistence.md) | Progress in one versioned localStorage key; deflate + base64url export code | Accepted |
| [ADR-004](ADR-004-simulator-architecture.md) | One timeline, deterministic, framework-free, registries | Accepted |
| [ADR-005](ADR-005-charting.md) | visx for charts | Accepted |
| [ADR-006](ADR-006-terminal.md) | A custom accessible terminal instead of xterm.js | Accepted |
