# Maintainer guide

For whoever keeps Beyond the Glass going after launch. Read [`AGENTS.md`](../AGENTS.md) first: its guardrails
(fictional Ravenpost only, original art, WCAG 2.2 AA, no banned words, no network calls) apply to every change.

## Every change

```bash
npm ci
npm run dev                # http://localhost:5173/
npm run lint && npm run typecheck && npm run lint:content
npm test                   # unit, DOM and repo tests
npm run test:e2e           # Playwright, Chromium only
python3 scripts/ac-trace.py --issue <ID>
python3 scripts/ac-trace.py --report docs/plan/AC-TRACEABILITY.md
```

Content changes (`content/`, `src/scenarios/`, `docs/evidence/`) need an SME's approval (CODEOWNERS).

## Add a lesson (about 30 minutes)

1. Copy `content/_template/` into `content/regions/<region>/<module>/` (see its README). A lesson is one
   MDX file plus `<lesson>.checks.yaml`.
2. Write it to [`docs/authoring.md`](authoring.md): objectives as actions, three to six steps under 350 words,
   a `<Depth>` with an ELI5 layer for each new idea, an `<Analogy>`, and at least three checks.
3. Components lessons can use are listed in `content/README.md` and `src/content/components.ts`; the
   content build rejects any other.
4. `npm run lint:content`, then open `#/lesson/<id>` and work through it with the keyboard only.

## Add a challenge (about 20 minutes)

1. Copy `content/_template/challenge-template.yaml` to `src/challenges/<id>.yaml`, and add one line to
   `src/challenges/index.ts`.
2. Objectives use the predicates in [`docs/sim/challenges.md`](sim/challenges.md). Give three hints
   (nudge, pointer, command) and an `expertPath`; CI replays it to prove the challenge can be solved.
3. Place it in a lesson: `<Terminal scenario="…" challenge="<id>" required />`, optionally with `view` for a
   pipelines, merge-request, Argo CD, dashboard, PromQL or observability panel beside the terminal.

## Add a scenario

Scenarios are YAML in `src/scenarios/` ([`docs/sim/scenarios.md`](sim/scenarios.md)), plus one line in
`src/scenarios/index.ts` and the list in `parse.test.ts`. Start from `stormwatch.yaml` for the full
reference system. Faults come from timeline events; `warmUp` plays the timeline before the learner arrives.
The GitOps fragments (`src/sim/gitops/fragments/`) compose onto a scenario in code: see
`src/scenarios/fragments.ts`. The build loads every scenario, so a broken one fails `npm run build`.

## Add a kubectl (or other) command

One file under `src/sim/commands/` exporting a `defineCommand(...)`, plus one line in
`src/sim/commands/registry.ts`. Match the real tool's output (golden files in `src/sim/commands/__golden__/`),
return an in-world explanation for anything unsupported, never throw, and add it to
[`docs/sim/support-matrix.md`](sim/support-matrix.md) in the same PR.

## Regenerate fixtures

The captured outputs of real tools (E6-11) come from the **capture-fixtures** workflow: run it from the
Actions tab (it's manual), review the diff it opens, and update any golden files the change affects.

## Release

1. Every PR merged and `main` green, including `python3 scripts/ac-trace.py --strict-all`.
2. Update `CHANGELOG.md`, then tag: `git tag v1.0.0 && git push origin v1.0.0`.
3. The **release** workflow builds and publishes the multi-arch container image, with its SBOM and
   provenance; GitHub Pages deploys from `main` on every merge.
