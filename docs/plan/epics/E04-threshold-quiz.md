# E4 · The Threshold: placement quiz & personalized path
<!-- epic: milestone=M1; labels=area:quiz -->

**Goal:** In 5–15 questions, the app learns enough about each learner's background to start them at the right place in each domain, without making anyone feel tested.

**Epic success criteria**
- [ ] `SC1` Default quiz is 12 questions; question count is configurable from 5 to 15 in one config value
- [ ] `SC2` The four persona fixtures (Watchstander, Sysadmin, Container-curious, Practitioner) each produce the expected placement (unit tests)
- [ ] `SC3` `manual` Median completion in pilot ≤ 8 minutes; ≥ 4 of 5 pilot users rate the placement "about right" or say they adjusted it easily
- [ ] `SC4` No numeric score is ever shown; results are framed as a starting trail

---

## E4-01 · Placement model and question bank
<!-- meta: milestone=M1; size=M; labels=area:quiz,type:content; depends= -->

**Scope:** Write `docs/design/placement.md` and `content/threshold/bank.yaml`:
- **Five domains:** Foundations (Linux, networking, ops), Containers, Kubernetes, Delivery (Git, CI/CD, GitOps), Observability
- **Item types:**
  - *Experience* (self-report, 4 options from "never touched it" to "I do this weekly")
  - *Scenario* (multiple choice with a real-world prompt such as "A pod shows `CrashLoopBackOff`. What do you look at first?"), always including **"I'm not sure yet"**
- Bank of ≥ 25 items (≥ 5 per domain), each with a domain, a difficulty (1–3), options, the correct option (for scenarios), and a one-sentence "why" shown in results
- Serving rule: 12 items = per domain, 1 experience item + 1–2 scenario items; adaptive skip (if Containers experience = "never", serve the easiest Containers scenario only)
- Scoring: per-domain level 0–3 (Wayfarer, Deckhand, Navigator, Pathfinder). When self-report and scenario disagree, use the **lower** level and flag "confirm in module check"
- Mapping table: domain level → module statuses (recommended / review / test-out available)
- Framing copy: intro ("there are no wrong answers — this picks your starting trail"), time estimate, privacy note

**Acceptance criteria**
- [ ] `AC1` Bank validates against a Zod schema at build time
- [ ] `AC2` `manual` Every scenario item is reviewed for accuracy by the SME (checkbox per item in the PR)
- [ ] `AC3` Items use only generic, fictional examples (content-guard passes)
- [ ] `AC4` Reading level of question stems ≤ grade 9 (Flesch-Kincaid via E5-06 lint)

---

## E4-02 · Quiz UI
<!-- meta: milestone=M1; size=M; labels=area:quiz,type:feature; depends=E4-01,E3-01,E2-01 -->

**Scope**
- Intro screen → one question per screen → "Reviewing your answers" → results
- Progress indicator ("Question 4 of 12") and Back button; answers autosave so a reload resumes mid-quiz
- Option to "Skip the Threshold and start from the very beginning", which sets all domains to Wayfarer
- Light Console Room styling (the glass monitor glows brighter as questions are answered)

**Acceptance criteria**
- [ ] `AC1` Fully keyboard operable; answer options are a proper radio group; arrow keys move within options
- [ ] `AC2` `manual` Screen reader announces question number, stem and options in order (verified with NVDA in the PR notes)
- [ ] `AC3` Reloading mid-quiz resumes at the same question with prior answers intact (Playwright)
- [ ] `AC4` No timer, no countdown, no score

---

## E4-03 · Scoring and path engine
<!-- meta: milestone=M1; size=M; labels=area:quiz,type:feature; depends=E4-01,E5-01 -->

**Scope**
- Pure functions in `src/placement/`: `selectItems(bank, config, answersSoFar)`, `score(answers) → DomainLevels`, `buildPath(levels, manifest) → PathPlan`
- `PathPlan`: ordered list of modules with status + reason ("Recommended because you're new to containers"), starting module, default depth layer per region (ELI5 for level 0, Operator for 1–2, Deep dive for 3)

**Acceptance criteria**
- [ ] `AC1` Four persona fixtures produce documented expected placements and starting modules (table-driven tests)
- [ ] `AC2` Engine is deterministic and has no React or DOM imports
- [ ] `AC3` ≥ 95% branch coverage
- [ ] `AC4` Changing the bank or manifest (adding a module) needs no code changes

---

## E4-04 · Results: "Your trail"
<!-- meta: milestone=M1; size=M; labels=area:quiz,type:feature; depends=E4-03,E2-03 -->

**Scope**
- Headline in narrative voice ("Your trail begins at the Harbor")
- Per-domain level as five labeled horizontal tracks (not a radar chart), with plain-language meaning per level
- "Why we suggested this" expandable rationale per domain
- Recommended first 3 modules; **Change my starting point** (choose any region/module) and **Start from the very beginning**
- Primary CTA **Step through the glass** → the Crossing (E1-06) → map

**Acceptance criteria**
- [ ] `AC1` Track visualization has an equivalent text list (each domain: level name + meaning)
- [ ] `AC2` Overrides persist and are reflected on the map and in the lead view
- [ ] `AC3` Playwright: persona answers → expected results text → crossing → map shows the expected "recommended next"

---

## E4-05 · Retake and per-module test-out
<!-- meta: milestone=M3; size=M; labels=area:quiz,type:feature; depends=E4-03,E5-03 -->

**Scope**
- Retake the Threshold from Settings (keeps lesson progress; recomputes recommendations)
- Each module may define a 3–5 item **test-out check**; passing marks the module "tested out" (counts toward completion)

**Acceptance criteria**
- [ ] `AC1` Retake never deletes lesson or challenge progress (test)
- [ ] `AC2` Test-out requires ≥ 80% correct; failing shows which concepts to review, with links to steps
- [ ] `AC3` Test-out results visible in the lead view as "tested out" (distinct from "completed")
