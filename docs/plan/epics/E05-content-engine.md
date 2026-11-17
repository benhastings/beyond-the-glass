# E5 · Content engine & authoring
<!-- epic: milestone=M2; labels=area:content -->

**Goal:** Lessons are written in MDX + YAML by humans or agents without touching engine code, and every lesson can move a learner from ELI5 to hands-on.

**Epic success criteria**
- [ ] `SC1` A new lesson with depth layers, knowledge checks and a terminal challenge can be authored in MDX + YAML alone (proven by the E5-07 walkthrough and an authoring-guide example)
- [ ] `SC2` Invalid content (bad IDs, broken references, schema errors) fails the build with file:line errors
- [ ] `SC3` Lesson progress persists per step and resumes exactly

---

## E5-01 · Content model, schemas and manifest
<!-- meta: milestone=M1; size=M; labels=area:content,type:feature; depends=E0-01 -->

**Scope**
- Hierarchy: Region → Module → Lesson → Step. IDs are stable kebab-case slugs.
- `content/regions/<region>/region.yaml`, `content/regions/<region>/<module>/module.yaml`, `.../<lesson>.mdx` with front matter (id, title, objectives, estimatedMinutes, domain, level, prerequisites, scenario?)
- Build step (Vite plugin) validates everything with Zod, resolves cross-references (glossary terms, scenario IDs, challenge IDs, prerequisites), and emits a typed `manifest.json`
- Lazy-load lesson bundles by route

**Acceptance criteria**
- [ ] `AC1` Broken references (unknown term, scenario or prerequisite) fail the build with a clear message naming the file and field
- [ ] `AC2` Prerequisite graph is checked for cycles at build time
- [ ] `AC3` Manifest exposes per-region and per-module time estimates (sum of lessons)
- [ ] `AC4` Fixture content in `content/__fixtures__` exercises every schema branch

---

## E5-02 · MDX lesson pipeline and core components
<!-- meta: milestone=M1; size=M; labels=area:content,type:feature; depends=E5-01,E1-03 -->

**Scope:** MDX compilation via `@mdx-js/rollup`, plus components available in every lesson without imports:
- `<Step>`: splits a lesson into steps
- `<Analogy then="…" now="…">`: ties a concept to the learner's on-prem experience
- `<Callout kind="info|warn|habit|eli5">`
- `<Term id="…">`: Field Guide link and preview
- `<Diagram>`: **Mermaid rendered to SVG at build time** (no runtime Mermaid), with required `alt` text
- `<CodeBlock>`, `<Kbd>`
- `<Terminal scenario="…" challenge="…">` (from E6-09/E6-10)
- `<Check id="…">` (from E5-03)

**Acceptance criteria**
- [ ] `AC1` A `<Diagram>` without `alt` fails the build
- [ ] `AC2` No Mermaid runtime in the client bundle (bundle analysis in PR)
- [ ] `AC3` Component registry pattern: adding a component means adding one file plus one registry line

---

## E5-03 · Knowledge checks
<!-- meta: milestone=M2; size=M; labels=area:content,type:feature; depends=E5-02,E3-01 -->

**Scope:** Check types defined in YAML next to the lesson:
- Single choice, multiple select, ordering ("put the triage steps in order"), matching (Rosetta Stone pairs), **spot-the-bug** (YAML snippet; click/select the faulty line)
- Each check has per-option feedback, unlimited retries, and an explanation shown after passing
- Results recorded in progress

**Acceptance criteria**
- [ ] `AC1` Every check type is keyboard-operable (ordering via move-up/move-down buttons, not drag only)
- [ ] `AC2` Spot-the-bug works with screen readers (lines are a listbox with line numbers)
- [ ] `AC3` Feedback is announced via a live region
- [ ] `AC4` Unit tests for each check type's grading logic

---

## E5-04 · Lesson player
<!-- meta: milestone=M1; size=M; labels=area:content,type:feature; depends=E5-02,E3-01,E2-01 -->

**Scope**
- Lesson header: title, objectives, time estimate, step count
- Step navigation (Prev/Next, step list sidebar, collapsible on narrow screens); Next is enabled even if a check isn't passed, but completion requires required checks/challenges
- Per-step persistence; completion screen with a "what you can do now" summary and next recommended lesson

**Acceptance criteria**
- [ ] `AC1` Deep link `/lesson/:id/:step` opens the exact step
- [ ] `AC2` Reload restores the step, check states and terminal history
- [ ] `AC3` Completion is recorded only when all `required` checks/challenges in the lesson are passed (test)

---

## E5-05 · Depth layers: ELI5 / Operator / Deep dive
<!-- meta: milestone=M2; size=S; labels=area:content,type:feature; depends=E5-02,E4-03 -->

**Scope**
- `<Depth>` component with `<ELI5>`, `<Operator>`, `<DeepDive>` children rendered as tabs
- Default tab comes from placement (per domain), and the learner's last choice per domain is remembered

**Acceptance criteria**
- [ ] `AC1` Tabs follow the WAI-ARIA tabs pattern (arrow keys, Home/End)
- [ ] `AC2` A missing layer is allowed, but the build warns when a `<Depth>` lacks an ELI5 layer
- [ ] `AC3` Placement-driven default verified by a component test for each level

---

## E5-06 · Authoring guide, lesson template and style lint
<!-- meta: milestone=M2; size=M; labels=area:content,type:docs; depends=E5-02 -->

**Scope**
- `docs/authoring.md`: voice and tone, structure of a lesson, how to write an `<Analogy>`, how to add a challenge, how to request SME review
- `content/_template/` lesson + module + checks + challenge
- `npm run lint:content`: flags banned words ("simply", "just", "obviously", "easy"), ELI5 blocks above grade 8 (Flesch-Kincaid), lessons without objectives, images without alt text, and steps longer than ~350 words

**Acceptance criteria**
- [ ] `AC1` `lint:content` runs in CI and fails on violations, with an allowlist comment escape hatch
- [ ] `AC2` The template lesson builds, renders, and passes lint unmodified

---

## E5-07 · Walking skeleton: first lesson end to end
<!-- meta: milestone=M1; size=M; labels=area:content,type:feature; depends=E5-04,E6-09,E6-10,E4-04,E2-02,E3-04 -->

**Context:** This issue proves M1. It may use temporary content.

**Scope**
- One lesson, "Your first look at the cluster", in the Chartroom: 4 steps, one `<Depth>`, one `<Check>`, one `<Terminal>` challenge ("List the pods in namespace `ravenpost` and find the one that isn't Running")
- Requires only `kubectl get pods` (with `-n`) and `kubectl get pods -A` from the simulator

**Acceptance criteria**
- [ ] `AC1` Playwright e2e against the **deployed** site: landing → quiz (persona answers) → results → crossing (skipped) → map → lesson → pass challenge → close the browser context → reopen → "Continue" resumes → lesson shows complete
- [ ] `AC2` That test is part of the post-deploy smoke suite
