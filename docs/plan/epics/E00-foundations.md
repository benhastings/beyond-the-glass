# E0 · Foundations & agent guardrails
<!-- epic: milestone=M0; labels=area:infra -->

**Goal:** A repo where any coding agent can pick up an issue, build it, prove it works, and ship it to GitHub Pages without breaking anything or leaking anything.

**Epic success criteria**
- [ ] `SC1` `main` is protected; CI (typecheck, lint, unit, e2e+axe, build, content-safety) is required on every PR
- [ ] `SC2` Every merge to `main` deploys to GitHub Pages automatically, and the deployed site loads with zero console errors
- [ ] `SC3` `AGENTS.md` Definition of Done is enforced by CI wherever it can be automated
- [ ] `SC4` The same build ships two ways: GitHub Pages (primary) and a small, hardened container image for local/internal hosting (fallback)
- [ ] `SC5` Every acceptance criterion in the plan is traceable to a passing tagged test or a reviewed evidence entry, and CI blocks an issue's PR until its criteria are traced

---

## E0-01 · Scaffold Vite + React + TypeScript app with strict tooling
<!-- meta: milestone=M0; size=S; labels=area:infra,type:chore; depends= -->

**Context:** Every other issue builds on this. Choices are fixed in ROADMAP §4.

**Scope**
- Vite + React + TS (`strict: true`, `noUncheckedIndexedAccess: true`), path alias `@/` → `src/`
- ESLint (typescript-eslint strict, react-hooks, jsx-a11y) + Prettier
- Tailwind CSS installed with a placeholder token file
- Folder layout from ROADMAP §4: `src/app`, `src/content`, `src/placement`, `src/progress`, `src/sim/{core,commands,gitops,telemetry,challenges}`, `src/scenarios`, `content/`
- npm scripts: `dev`, `build`, `preview`, `typecheck`, `lint`, `format`, `test`, `test:e2e`
- `.nvmrc` pinning Node LTS

**Acceptance criteria**
- [ ] `AC1` `npm ci && npm run typecheck && npm run lint && npm run build` succeeds on a clean clone
- [ ] `AC2` `src/sim/**` has an ESLint rule forbidding imports from `react`, `src/app/**`, or any DOM API (framework-free core)
- [ ] `AC3` `vite.config.ts` uses a relative `base: './'` so one build runs unchanged on GitHub Pages (`/beyond-the-glass/`), in the container (`/`) or under any other path
- [ ] `AC4` README "Getting started" section documents the scripts

---

## E0-02 · CI pipeline on GitHub Actions
<!-- meta: milestone=M0; size=S; labels=area:infra,type:chore; depends=E0-01 -->

**Scope**
- Workflow on PR and push to `main`: install (with cache), typecheck, lint, unit tests, build
- Upload build artifact; post bundle-size summary to the job summary

**Acceptance criteria**
- [ ] `AC1` `manual` Workflow runs in < 5 min on a cold cache for the scaffold
- [ ] `AC2` `manual` A PR with a type error, lint error or failing test is blocked (demonstrated in the PR description with links to a failing run)
- [ ] `AC3` Branch protection instructions are documented in `CONTRIBUTING.md` (required checks named exactly as in the workflow)

---

## E0-03 · Deploy to GitHub Pages
<!-- meta: milestone=M0; size=S; labels=area:infra,type:chore; depends=E0-01,E0-02 -->

**Scope**
- `actions/configure-pages` + `actions/upload-pages-artifact` + `actions/deploy-pages` on push to `main`
- HashRouter-based routing so deep links work without server rewrites
- `404.html` that redirects to the hash route equivalent (for old links)

**Acceptance criteria**
- [ ] `AC1` `manual` Merge to `main` publishes to `https://<owner>.github.io/<repo>/` within 5 minutes
- [ ] `AC2` Hard-refreshing a deep link (e.g. `/#/region/chartroom`) loads the correct view
- [ ] `AC3` Deployed site makes **zero** requests to origins other than its own (verified by a Playwright test that fails on any third-party request)
- [ ] `AC4` A smoke test runs against the deployed URL after deploy and fails the workflow if the landing view doesn't render

---

## E0-04 · Issue templates, PR template and CODEOWNERS
<!-- meta: milestone=M0; size=S; labels=area:infra,type:docs; depends= -->

**Scope**
- Issue templates: feature, content/lesson, bug, scenario
- PR template that embeds the Definition of Done checklist from `AGENTS.md`, plus "screenshots/recording for UI changes" and "acceptance criteria copied and checked"
- `CODEOWNERS` routing `content/**` and `src/scenarios/**` to the SME reviewer(s)

**Acceptance criteria**
- [ ] `AC1` `manual` New issues and PRs show the templates in the GitHub UI
- [ ] `AC2` PR template includes every DoD item from `AGENTS.md` verbatim (a CI step diffs them and fails if they drift)

---

## E0-05 · Test harness: unit, component, e2e and accessibility
<!-- meta: milestone=M0; size=M; labels=area:infra,type:test; depends=E0-02 -->

**Scope**
- Vitest + Testing Library + jsdom; coverage via v8
- Playwright (Chromium, Firefox, WebKit) with `@axe-core/playwright`
- Shared helper `expectNoA11yViolations(page)` and `blockThirdPartyRequests(page)`
- Example tests for each layer; CI job for e2e running against `vite preview`

**Acceptance criteria**
- [ ] `AC1` `npm test` and `npm run test:e2e` run locally and in CI
- [ ] `AC2` Coverage thresholds enforced: `src/sim/**`, `src/placement/**` and `src/progress/**` ≥ 90% lines; global ≥ 70%
- [ ] `AC3` Any axe violation (serious or critical) fails CI
- [ ] `AC4` Playwright traces and screenshots are uploaded as artifacts on failure

---

## E0-06 · Content-safety and IP guard check
<!-- meta: milestone=M0; size=S; labels=area:infra,type:chore; depends=E0-02 -->

**Context:** The repo and site are public. No internal names, hosts, IPs or CUI may ever land in them, and the world must stay IP-original (ROADMAP §3).

**Scope**
- `scripts/content-guard.mjs` scans all tracked text files
- **Private denylist** read from the `CONTENT_DENYLIST` Actions secret (newline-separated regexes). It is never committed. When the secret is absent (e.g. in a fork), the check warns instead of failing.
- **Public IP denylist** committed in `scripts/ip-denylist.txt`: franchise names, characters and iconic props from the Narnia books and films, plus other well-known fantasy IP
- Flags non-documentation IPv4 addresses outside RFC 5737 ranges and the simulator's documented pod/service CIDRs
- Flags hostnames ending in `.mil`, `.gov`, or any `*.internal`/`*.corp` pattern

**Acceptance criteria**
- [ ] `AC1` CI job `content-guard` is required and fails on any match, printing file:line and the pattern category (never the private pattern itself)
- [ ] `AC2` Unit tests cover true positives, allowed sim CIDRs (`10.244.0.0/16`, `10.96.0.0/12`) and RFC 5737 docs ranges
- [ ] `AC3` Guardrail documents that must name the IP to forbid it (`AGENTS.md`, `docs/plan/**`, `scripts/ip-denylist.txt`) are allowlisted by path for the IP denylist only. The private denylist still applies to them.
- [ ] `AC4` `CONTRIBUTING.md` explains how to set the secret and how to request an allowlist exception

---

## E0-07 · Architecture Decision Records
<!-- meta: milestone=M0; size=S; labels=area:infra,type:docs; depends= -->

**Scope:** `docs/adr/` with a template and these records:
- ADR-001 Frontend stack (React/Vite/TS/Tailwind/Radix/Zustand/Zod)
- ADR-002 Routing on GitHub Pages (HashRouter)
- ADR-003 Progress persistence and export codec
- ADR-004 Simulator architecture (one timeline, deterministic, framework-free core, registry pattern)
- ADR-005 Charting library (**decide**: visx vs Recharts; criteria: SVG output, a11y, bundle size, time-series ergonomics). Include a 1-page spike comparison.
- ADR-006 Custom accessible terminal instead of xterm.js

**Acceptance criteria**
- [ ] `AC1` Each ADR has Context / Decision / Consequences / Alternatives considered
- [ ] `AC2` `manual` ADR-005 records the decision with measured gzip size of a sample time-series panel in each candidate

---

## E0-08 · Performance and bundle budgets in CI
<!-- meta: milestone=M0; size=S; labels=area:infra,type:chore; depends=E0-03 -->

**Scope**
- Lighthouse CI against the preview build for `/`, `/#/threshold`, and one lesson route (added as routes appear)
- `size-limit` (or equivalent) for the initial JS chunk

**Acceptance criteria**
- [ ] `AC1` CI fails if Performance < 90, Accessibility < 100, or Best Practices < 95 on any audited route
- [ ] `AC2` CI fails if the initial JS exceeds 250 KB gzipped
- [ ] `AC3` Budgets are documented in `AGENTS.md` and adjustable in one config file

---

## E0-09 · Self-hostable container image (local / internal fallback)
<!-- meta: milestone=M0; size=M; labels=area:infra,type:feature; depends=E0-01,E0-02,E0-05 -->

**Context:** The team can reach `*.github.io` today, but we want a fallback that can be run on a laptop or deployed to an internal cluster, including air-gapped ones. As a bonus, the image is a real workload the team can deploy with their own GitLab/Argo CD flow.

**Scope**
- Multi-stage `Dockerfile`: `node:<lts>-alpine` build stage (`npm ci && npm run build`) → `nginxinc/nginx-unprivileged:alpine-slim` runtime stage serving `dist/` on port **8080**
- `nginx.conf`: gzip, long-cache headers for hashed assets, `no-cache` for `index.html`, security headers (strict CSP with `default-src 'self'`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`), `/healthz` endpoint
- Runs as non-root, works with a read-only root filesystem (writable `tmpfs` only for nginx temp dirs), no shell needed at runtime
- Image labels per OCI spec (source, revision, version); `.dockerignore`
- `deploy/k8s/` example manifests (Deployment with probes, resource requests/limits, `securityContext`, Service) plus a `kustomization.yaml`; `deploy/compose.yaml` for `docker compose up`
- Workflow `container.yml`: build on PR (no push); on tag `v*` build multi-arch (`linux/amd64`, `linux/arm64`) and push to `ghcr.io/<owner>/beyond-the-glass`, with SBOM + provenance attestations
- Document `docker save`/`docker load` for moving the image into air-gapped environments

**Acceptance criteria**
- [ ] `AC1` `docker build -t btg . && docker run --rm -p 8080:8080 btg` serves the app at `http://localhost:8080/`, and the Playwright smoke suite passes against it in CI
- [ ] `AC2` Compressed image size ≤ 30 MB (CI step fails above the limit)
- [ ] `AC3` Container runs as a non-root UID and passes the smoke suite with `--read-only --cap-drop=ALL --security-opt=no-new-privileges`
- [ ] `AC4` `GET /healthz` returns 200; deep links (`/#/region/chartroom`) and hard refresh work
- [ ] `AC5` Response headers include the CSP and security headers listed above (asserted in an e2e test), and the app makes zero requests to other origins
- [ ] `AC6` Trivy (or Grype) scan reports zero critical/high vulnerabilities with available fixes; CI fails otherwise
- [ ] `AC7` `kubectl apply -k deploy/k8s` on a kind cluster yields a Ready pod and a Service that serves the app (CI job using kind)
- [ ] `AC8` Tagged releases publish a multi-arch image to GHCR with SBOM and provenance attestations
- [ ] `AC9` README documents run, compose, k8s, and air-gapped (`docker save`/`load`) usage

---

## E0-10 · Acceptance-criteria traceability gate
<!-- meta: milestone=M0; size=S; labels=area:infra,type:test; depends=E0-02,E0-05 -->

**Context:** `scripts/ac-trace.py` already exists. It parses every `ACn`/`SCn` criterion in `docs/plan/epics/` and finds where each one is verified. This issue wires it into the test frameworks and PR flow so no issue can close with untraced criteria. See `docs/testing/acceptance-criteria.md`.

**Scope**
- Test helpers so tags are consistent: Vitest `acTest('E6-04.AC2', 'parser never throws', fn)` and Playwright `acTest(...)` wrappers that prefix titles with `[E6-04.AC2]`
- Workflow `ac-trace.yml`:
  - On PRs: read `Closes #n` from the PR body, map `#n` → issue ID via `docs/plan/issue-map.json`, and run `python3 scripts/ac-trace.py --issue <ID>` (strict)
  - On `main`: run `--report` and publish the traceability matrix to the job summary and `docs/plan/AC-TRACEABILITY.md`
- Make `ac-trace` a required check; CODEOWNERS requires Ben's review on `docs/evidence/**`
- The test runner's results (JUnit XML from Vitest and Playwright) are cross-checked: a criterion counts as traced only if its tagged test **ran and passed** in this CI run (skipped or failing tests don't count)

**Acceptance criteria**
- [ ] `AC1` A PR that `Closes` an issue with any untraced criterion fails `ac-trace` with a list of the missing tags
- [ ] `AC2` Tags in tests that don't match any criterion (typos, stale IDs) fail the check
- [ ] `AC3` Skipped (`.skip`, `.todo`, `test.fixme`) or failing tagged tests don't count as traced (verified against JUnit results)
- [ ] `AC4` Criteria marked `manual` are traced only by an entry in `docs/evidence/<ID>.md` under a heading for that criterion, with non-empty evidence
- [ ] `AC5` `scripts/ac-trace.py` has its own unit tests (`python3 -m unittest discover scripts/tests`) running in CI
- [ ] `AC6` The traceability matrix on `main` shows per-epic and per-milestone percentages
