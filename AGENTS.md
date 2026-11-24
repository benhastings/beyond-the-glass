# AGENTS.md — working on Beyond the Glass

This file is for coding agents (and humans) picking up issues in this repo. Read it fully before your first change.

## 1. Orientation
- **What we're building:** see [`docs/plan/ROADMAP.md`](docs/plan/ROADMAP.md). Read §3 (the world), §4 (architecture) and §6 (success criteria) before starting any issue.
- **Where the work is:** GitHub issues, created from [`docs/plan/epics/`](docs/plan/epics/). Each issue has an ID like `E6-04` in its title.
- **Picking work:** choose an open issue labeled `agent-ready` whose "Blocked by" issues are all closed. Don't pick `needs-human` issues unless a human has asked you to prepare a draft for review.

## 2. Ground rules
1. **One issue per PR.** The branch name is `e6-04-short-slug`, and the PR title is `E6-04: <issue title>`. The PR body must say `Closes #<n>`.
2. **Acceptance criteria are the contract, and each one must be traced.** Every criterion has a tag like `E6-04.AC2`. Automated criteria need a test whose title starts with `[E6-04.AC2]`. Criteria marked `manual` need an entry in `docs/evidence/E6-04.md`. Run `python3 scripts/ac-trace.py --issue E6-04` and refresh the matrix (`python3 scripts/ac-trace.py --report docs/plan/AC-TRACEABILITY.md`) before opening the PR; the `gate` check runs it again against that CI run's test results. Copy the criteria into the PR description and check each one. If a criterion turns out to be wrong or impossible, say so in the PR and the issue. Never skip it, weaken a test to make it pass, or renumber criteria. See [`docs/testing/acceptance-criteria.md`](docs/testing/acceptance-criteria.md).
3. **Stay in scope.** If you find adjacent work, open a new issue (with the `discovered` label) rather than expanding the PR.
4. **Respect the boundaries:**
   - `src/sim/**`, `src/placement/**`, `src/progress/**` and `src/content/**` are **framework-free TypeScript**: no React, no DOM, no `window`.
   - New commands, lesson components, check types, panels and scenario fragments are added through their **registry**: one new file plus one registry line. Avoid editing shared files that other agents are likely to touch.
5. **Determinism.** Never use `Math.random()` or `Date.now()` inside the simulator or telemetry. Use the sim RNG and `SimClock`.
6. **No runtime network calls** to anything other than the app's own origin. Self-host fonts and assets. No analytics, CDNs or embeds.
7. **Path-independent build.** The same `dist/` runs on GitHub Pages (`/beyond-the-glass/`) and in the container (`/`). Use relative asset URLs and hash routes only; never hard-code the base path.

## 3. Guardrails (non-negotiable)
- **Public repo, public site.** Never add real hostnames, IP addresses, system names, agency names, people's names, ticket numbers, screenshots of real tools, or anything from the operator's actual environment. Use the fictional **Ravenpost** system and `*.example` domains. The `content-guard` CI check enforces this, and it also checks a private denylist you can't see. If it fails on your PR, remove the content; don't try to work around the pattern.
- **Original world only.** The app evokes the *feeling* of stepping through a portal into an enchanted world, but it uses **no** names, characters, creatures, places or iconic props from Narnia or any other copyrighted franchise (see `scripts/ip-denylist.txt`). Never write "inspired by Narnia" in user-facing copy.
- **Trademarks.** Kubernetes, Argo CD, GitLab, Grafana, Prometheus and OpenTelemetry may be named in text. Do not use their logos, and do not clone their UIs pixel-for-pixel. Our mock UIs *evoke* the layout.
- **Accessibility is a feature, not a phase.** Every UI issue must meet WCAG 2.2 AA. Visual-only information always needs a text/table equivalent.
- **Tone.** Respect learners' experience. Banned in learner-facing copy: "simply", "just", "obviously", "easy", "trivial". No numeric quiz scores. No time pressure.

## 4. Definition of Done
A PR is mergeable only when all of the following are true:

- [ ] All acceptance criteria in the linked issue are met, and `python3 scripts/ac-trace.py --issue <ID>` passes (each automated criterion has a passing test tagged `[<ID>.ACn]`, each manual one has evidence in `docs/evidence/<ID>.md`)
- [ ] `npm run typecheck`, `npm run lint`, `npm test` and `npm run test:e2e` pass locally and in CI
- [ ] New logic has unit tests; framework-free packages stay at ≥ 90% line coverage
- [ ] User-facing changes have a Playwright test covering the main path, and axe reports zero violations
- [ ] Keyboard-only operation verified; focus order and visible focus checked
- [ ] Reduced-motion behavior verified for any animation
- [ ] UI changes include screenshots (both moods if applicable) or a short recording
- [ ] `content-guard` and `lint:content` pass
- [ ] Docs updated (support matrix, authoring guide, ADRs) when behavior or conventions change
- [ ] No new runtime third-party requests; bundle budgets still pass

## 5. Budgets
| Budget | Limit |
|---|---|
| Initial JS (gzipped) | ≤ 250 KB |
| Lighthouse Performance / Accessibility / Best Practices | ≥ 90 / 100 / ≥ 95 |
| Sim command evaluation | < 5 ms typical |
| Panel render (6 h of data) | < 100 ms |

## 6. Simulator realism rules
- Output formats must match real tools. When in doubt, compare against the captured fixtures in `src/sim/__fixtures__/real/` (E6-11), not against memory.
- Every supported command and flag is listed in `docs/sim/support-matrix.md`. Update it in the same PR.
- Unsupported-but-real commands return an in-world explanation plus a supported alternative. Never throw.
- **One timeline, many views:** if you add a fault or event, add its evidence to *every* signal it would touch (cluster state, events, logs, metrics, traces, Argo) and extend the contract tests.

## 7. Content rules
- Follow [`docs/authoring.md`](docs/authoring.md) (from E5-06) and the Content Definition of Done in `docs/plan/epics/E09-curriculum.md`.
- Every command shown in a lesson must run in the simulator.
- Content PRs need SME approval (CODEOWNERS enforces this).

## 8. When stuck
- If an acceptance criterion conflicts with this file or the roadmap, stop and comment on the issue with the conflict and a proposed resolution.
- If a dependency issue isn't actually done (missing API, wrong shape), comment on both issues. Don't reimplement the dependency inside your PR.
