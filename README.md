# Beyond the Glass

> *For years you watched the glass. Now step through it.*

A self-paced, interactive journey for operators moving from on-prem, eyes-on-glass operations into Kubernetes, GitOps and modern observability. Learners take a short placement quiz, then follow a personalized trail from ELI5 foundations to troubleshooting a failing microservice with `kubectl`, Argo CD, Grafana/Prometheus and OpenTelemetry. All hands-on practice runs in a browser simulation, so there's nothing to install.

- **Runs on:** GitHub Pages (static; no backend)
- **Your progress:** saved in your browser; export/import with a progress code
- **Status:** planning. See the [roadmap](docs/plan/ROADMAP.md).

## Getting started

Requires Node 26 (see `.nvmrc`; `nvm use` picks it up).

```bash
npm ci               # install exactly what package-lock.json pins
npm run dev          # dev server with hot reload
npm run build        # production build into dist/
npm run preview      # serve dist/ locally
npm run typecheck    # TypeScript in strict mode, no emit
npm run lint         # ESLint (typescript-eslint strict, react-hooks, jsx-a11y); fails on any warning
npm run format       # rewrite files with Prettier
npm run format:check # fail if any file isn't Prettier-formatted
npm test             # Vitest unit and repo tests
npm run test:e2e     # Playwright end-to-end tests
```

`src/sim`, `src/placement`, `src/progress` and `src/content` are framework-free: `npm run lint` fails on
any React import, any import from `src/app`, or any DOM API there.

## For contributors and coding agents
- Start with [`AGENTS.md`](AGENTS.md)
- Plan and epics: [`docs/plan/`](docs/plan/)
- Issues are generated from the epic files by [`scripts/create-issues.py`](scripts/create-issues.py)
