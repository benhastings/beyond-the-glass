# E11 · Quality, accessibility & launch
<!-- epic: milestone=M6; labels=area:quality -->

**Goal:** Prove the app is accessible, fast and genuinely useful to the people it's for, then launch it with documentation for learners, leads and maintainers.

**Epic success criteria**
- [ ] `SC1` All launch gates in ROADMAP §6 are met and evidenced in a launch checklist issue
- [ ] `SC2` `manual` Pilot outcome measures are collected and recorded in `docs/pilot/results.md`

---

## E11-01 · Accessibility audit (WCAG 2.2 AA)
<!-- meta: milestone=M6; size=M; labels=area:quality,type:test,needs-human; depends=E10-04,E10-05 -->

**Scope**
- Manual audit of every route and tool with keyboard-only, NVDA + Firefox, JAWS + Chrome/Edge, VoiceOver + Safari; 200% and 400% zoom; forced colors; reduced motion
- Findings logged as issues labeled `a11y` with WCAG criterion references; fix all serious/critical findings

**Acceptance criteria**
- [ ] `AC1` `manual` `docs/accessibility/audit-<date>.md` with method, scope, findings and status
- [ ] `AC2` `manual` Zero open serious/critical findings at launch
- [ ] `AC3` Accessibility statement page in the app (conformance target, known limitations, contact)

---

## E11-02 · Performance hardening
<!-- meta: milestone=M6; size=M; labels=area:quality,type:chore; depends=E10-04 -->

**Scope:** Route-level code splitting audit, asset optimization (SVGO, font subsetting), Web Worker for telemetry generation if main-thread long tasks exceed 50 ms, preload critical assets.

**Acceptance criteria**
- [ ] `AC1` Lighthouse budgets from E0-08 pass on all main routes, including `/stormwatch`
- [ ] `AC2` `manual` No long task > 100 ms during normal war-room interaction (performance trace attached)
- [ ] `AC3` Initial JS ≤ 250 KB gzipped

---

## E11-03 · Cross-browser and device matrix
<!-- meta: milestone=M6; size=S; labels=area:quality,type:test; depends=E10-04 -->

**Scope:** Latest Chrome, Edge, Firefox (+ ESR), Safari; Windows 10/11 and macOS; 1280×720 minimum for the war room; tablet usable; phone supports reading lessons and quizzes (sim panes show "best on a larger screen" with a still-functional tab mode).

**Acceptance criteria**
- [ ] `AC1` Playwright full-journey suite green on Chromium, Firefox, WebKit
- [ ] `AC2` `manual` Manual checklist completed on Edge + Windows (likely the team's default environment)

---

## E11-04 · Pilot with 5+ team members
<!-- meta: milestone=M6; size=M; labels=area:quality,type:test,needs-human; depends=E10-05,E11-01 -->

**Scope**
- Recruit ≥ 5 learners spanning the personas; a pre-survey (confidence 1–5 on troubleshooting tasks)
- Moderated sessions for Threshold + first region (think-aloud), then 2 weeks self-paced
- Post-survey: confidence, SUS, open feedback; tabletop exercise using the triage flow
- Feedback captured via a "Feedback" link that opens a prefilled GitHub issue (or printed form if GitHub access is restricted)

**Acceptance criteria**
- [ ] `AC1` `manual` `docs/pilot/results.md` reports: quiz completion time, placement accuracy ("about right"), region completion, capstone completion, confidence delta, SUS score
- [ ] `AC2` `manual` Every pilot finding is triaged into an issue or explicitly declined with reasoning

---

## E11-05 · Documentation and launch
<!-- meta: milestone=M6; size=S; labels=area:quality,type:docs; depends=E11-04 -->

**Scope**
- `README.md`: what it is, link to the site, privacy statement
- `docs/facilitator-guide.md`: how leads roll this out, use the lead view, run a tabletop with the capstone
- `docs/maintainer-guide.md`: add a lesson, add a scenario, add a kubectl command, regenerate fixtures, release process
- Tag `v1.0.0` with a changelog

**Acceptance criteria**
- [ ] `AC1` `manual` A new maintainer follows the guide to add a lesson + challenge in < 1 hour (dry-run by someone who didn't build it)
- [ ] `AC2` `manual` Launch checklist issue with every ROADMAP §6 gate linked to evidence
- [ ] `AC3` `python3 scripts/ac-trace.py --strict-all` passes on the release commit (every criterion in the plan is traced)
