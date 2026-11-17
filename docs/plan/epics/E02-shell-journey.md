# E2 · App shell, journey overview & navigation
<!-- epic: milestone=M1; labels=area:app -->

**Goal:** The learner always knows where they are, where they're going and how far they've come, starting from a first view that shows the whole journey.

**Epic success criteria**
- [ ] `SC1` The first view gives a complete overview of the journey (regions, what you'll be able to do at the end, time estimate) and reaches the quiz in ≤ 2 clicks
- [ ] `SC2` A returning learner lands on a "Continue" path that resumes their exact step in 1 click
- [ ] `SC3` Every route has a unique `<title>`, one `<h1>`, landmarks, and focus moved to the main heading on navigation
- [ ] `SC4` Every visual navigation surface (the map) has an equivalent list/text navigation

---

## E2-01 · App shell, routing and focus management
<!-- meta: milestone=M1; size=M; labels=area:app,type:feature; depends=E0-03 -->

**Scope**
- Layout: header (logo/home, progress indicator, Field Guide, Settings), `<main>`, footer
- Routes: `/` (Console Room), `/threshold`, `/threshold/results`, `/map`, `/region/:regionId`, `/lesson/:lessonId/:step?`, `/guide`, `/guide/:term`, `/settings`, `/lead`, `/stormwatch`, 404
- On route change: update `document.title`, move focus to `h1`, announce the page via a polite live region
- Skip link to main content; error boundary with a friendly recovery screen

**Acceptance criteria**
- [ ] `AC1` Keyboard-only Playwright test navigates all top-level routes using Tab/Enter only
- [ ] `AC2` Back/forward browser buttons restore the correct view and scroll position
- [ ] `AC3` Unknown routes render the 404 view with a link home (no blank screen)
- [ ] `AC4` Shell renders correctly while the content manifest is still loading (skeleton state, no layout shift > 0.1 CLS)

---

## E2-02 · Console Room: the journey overview (first view)
<!-- meta: milestone=M1; size=M; labels=area:app,type:feature; depends=E2-01,E3-01 -->

**Scope**
- **New visitor:** the Console Room scene, a 2–3 sentence hook, "The journey" section (6 regions with one-line outcomes each), "By the end you'll be able to…" (4–5 concrete capabilities), total time estimate, privacy note ("progress stays in your browser"), primary CTA **Step up to the Threshold** (the quiz)
- **Returning visitor:** same layout, but the primary CTA becomes **Continue: <lesson name>**, with a secondary "View the map"
- Until the illustration from E1-04 lands, use a placeholder scene

**Acceptance criteria**
- [ ] `AC1` New visitor reaches the first quiz question in ≤ 2 clicks (Playwright)
- [ ] `AC2` Returning visitor with saved progress sees "Continue" pointing to their last incomplete step (Playwright with seeded storage)
- [ ] `AC3` All copy passes the content style lint (E5-06) and avoids "simply"/"just"/"obviously"
- [ ] `AC4` Page is fully usable at 320 px wide (reflow) and at 400% zoom

---

## E2-03 · Journey map (the Reach)
<!-- meta: milestone=M1; size=M; labels=area:app,type:feature; depends=E2-01,E3-01,E5-01 -->

**Scope**
- Interactive map of six regions + the Console Room. Each shows a status: *recommended next*, *in progress*, *complete*, *optional (tested out)*, *not started*
- Regions are **never hard-locked**. Recommended order is shown, but learners can explore freely.
- Selecting a region opens its region page
- A **List view** toggle presents the same information as an ordered list (default for screen readers via a visually hidden link at the top)
- Uses E1-05 art when available; ships first with a simple SVG placeholder

**Acceptance criteria**
- [ ] `AC1` Map is operable with arrow keys (roving tabindex) and Enter; each region has an accessible name including its status ("Helm Keep — in progress, 2 of 5 modules")
- [ ] `AC2` Status is never conveyed by color alone
- [ ] `AC3` Map and list views show identical data (component test asserts parity)
- [ ] `AC4` Map reflects placement results immediately after the quiz (integration test)

---

## E2-04 · Region page template
<!-- meta: milestone=M1; size=S; labels=area:app,type:feature; depends=E2-01,E5-01 -->

**Scope**
- Region vignette, intro narrative (2–4 sentences), "What you'll learn" bullets, module list with status, time estimates and "Test out" links (E4-05)
- Previous/next region navigation

**Acceptance criteria**
- [ ] `AC1` Renders entirely from the content manifest (no region-specific code)
- [ ] `AC2` Adding a new region in content makes it appear on the map, list and region page without code changes (test with a fixture region)

---

## E2-05 · Field Guide: glossary and the Rosetta Stone
<!-- meta: milestone=M2; size=M; labels=area:app,type:feature; depends=E5-01 -->

**Context:** The Rosetta Stone maps what learners already know to the new world. It's the most important bridging device in the app.

**Scope**
- Glossary from `content/glossary.yaml`: term, ELI5 definition, operator definition, related terms, first-introduced-in lesson
- **Rosetta Stone** table from `content/rosetta.yaml`: *Then* (on-prem/NOC) → *Now* (cloud-native) → *Why it changed*. Seed entries: server→node, process→container, golden image→container image, init script/service→Deployment, VIP/load balancer→Service, change ticket→merge request, manual change→GitOps sync, Nagios check→Prometheus alert rule, `tail -f /var/log`→`kubectl logs`/Loki, watching the wall→alerting on SLOs, runbook binder→linked runbooks, ping/traceroute→distributed traces
- Client-side search (no external index service)
- `<Term>` component in lessons links to and previews entries

**Acceptance criteria**
- [ ] `AC1` `manual` Rosetta Stone ships with ≥ 20 entries, each reviewed by the SME
- [ ] `AC2` Search finds terms by name, alias and acronym (e.g., "HPA", "OOM") in < 50 ms with 300 entries
- [ ] `AC3` Term previews are accessible (focus-triggered, dismissible with Esc, not hover-only)

---

## E2-06 · Settings and "Your Pack"
<!-- meta: milestone=M1; size=S; labels=area:app,type:feature; depends=E3-03,E2-01 -->

**Scope**
- Display: reduce motion, high contrast, text size, replay the Crossing
- Progress: export code (copy), download `.json`, import (paste or upload), reset (typed confirmation)
- "About your data": plain-language explanation that everything is stored locally

**Acceptance criteria**
- [ ] `AC1` Reset requires typing `RESET` and offers a final export first
- [ ] `AC2` Settings changes apply immediately and persist across reloads
- [ ] `AC3` All controls labeled; passes axe

---

## E2-07 · Printable field cards (cheat sheets)
<!-- meta: milestone=M3; size=S; labels=area:app,type:feature; depends=E2-05 -->

**Scope:** Print-optimized pages (CSS `@media print`), one page each: kubectl triage flow, kubectl essentials, argocd essentials, PromQL starter queries, "first 5 minutes of an incident" checklist.

**Acceptance criteria**
- [ ] `AC1` Each prints on one US Letter page with no clipped content (Playwright PDF snapshot)
- [ ] `AC2` Commands on the cards are exactly the ones taught and supported in the sim (test cross-references the command registry)
