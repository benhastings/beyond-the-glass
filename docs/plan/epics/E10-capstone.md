# E10 · Capstone: Stormwatch — "The Long Night"
<!-- epic: milestone=M5; labels=area:capstone -->

**Goal:** A layered, realistic incident on the fictional **Ravenpost** service where learners use everything they learned to diagnose and fix several overlapping failures, then reflect in a debrief.

**Epic success criteria**
- [ ] `SC1` The incident exercises ≥ 6 distinct failure modes across Kubernetes, GitOps and observability layers, including at least one red herring
- [ ] `SC2` Each act is solvable using only tools and commands taught in E9 (verified by mapping each expert-path step to a lesson)
- [ ] `SC3` An automated expert playthrough completes all acts in CI
- [ ] `SC4` Learners can pause at any point and resume exactly (snapshot test mid-act)
- [ ] `SC5` `manual` ≥ 60% of pilot learners complete it; the debrief is rated useful by ≥ 4 of 5

---

## E10-01 · Ravenpost reference system
<!-- meta: milestone=M5; size=M; labels=area:capstone,type:feature; depends=E6-03,E7-01,E8-01 -->

**Context:** Ravenpost is an in-world message-delivery service ("ravens carry messages between the regions"). It is fictional and generic, with nothing modeled on any real internal system.

**Scope**
- Topology: `gate` (ingress/frontend) → `ravenpost-api` → `ledger` (Postgres-backed) ; `ravenpost-api` → queue (Redis) → `scribe` (worker)
- Namespaces `ravenpost` (prod), `ravenpost-stage`; contexts `stage` and `prod`
- Deploy repo manifests, Argo apps (auto-sync + self-heal on prod), pipelines, dashboards, alert rules, SLOs, and a healthy baseline telemetry profile
- `docs/sim/ravenpost.md` describing the system as an "on-call handbook" (architecture diagram, dashboards, runbook stubs)

**Acceptance criteria**
- [ ] `AC1` Baseline scenario runs 6 h of sim time with all signals green and no alerts (test)
- [ ] `AC2` Handbook diagrams render via build-time Mermaid; content-guard passes

---

## E10-02 · Incident script: four acts
<!-- meta: milestone=M5; size=M; labels=area:capstone,type:content; depends=E10-01 -->

**Scope:** Write `src/scenarios/the-long-night.yaml` + narrative copy. Proposed acts (the SME may adjust):
1. **The pager** (21:02): `RavenpostHighErrorRate` fires. A release merged at 20:55 wrote a bad image tag → new pods `ImagePullBackOff`; the rollout stalls and Argo shows *Progressing → Degraded*. Fix: `git revert` via MR, or fix the tag; Argo syncs.
2. **Still bleeding**: after the fix, `ravenpost-api` goes `CrashLoopBackOff`. The same release added a required config key that's missing from the ConfigMap (`--previous` logs show it). Fix via MR to the ConfigMap.
3. **The slow creep**: p99 latency climbs. Traces show `ledger` doing N+1 queries behind a feature flag enabled in that release; meanwhile `scribe` is `OOMKilled` as the queue backlog grows (memory limit too low for the backlog). Fix: disable flag via config MR; raise `scribe` limit via MR. **Red herring:** a noisy `NodeDiskPressure` warning on a non-affected node.
4. **Someone helped**: a colleague's earlier `kubectl edit` of `gate`'s readiness probe path (drift) was reverted by self-heal, but the desired state in Git *also* has a wrong path from a hurried MR. Outcome: `gate` not Ready → no endpoints → 503s. Fix the probe path in Git, sync, verify endpoints and SLO recovery.
- Wrap-up: write an incident note (structured form).

**Acceptance criteria**
- [ ] `AC1` Failure modes covered: ImagePullBackOff, Argo Degraded/stalled rollout, CrashLoopBackOff + missing config, latency regression via traces, OOMKilled, drift/self-heal, readiness → no endpoints, plus red herring
- [ ] `AC2` Each act lists its evidence in every signal (table in the scenario doc) and its expert path
- [ ] `AC3` Timeline is consistent across signals (contract tests from E8-01 pass on this scenario)

---

## E10-03 · Capstone engine: acts, state and scoring
<!-- meta: milestone=M5; size=L; labels=area:capstone,type:feature; depends=E10-02,E6-10,E7-06,E8-07 -->

**Scope**
- Multi-act orchestration: act objectives, act transitions triggered by predicates, timeline pauses while the learner investigates (sim time advances on actions plus a gentle background clock)
- Scoring (shown only in the debrief, as feedback): evidence gathered before acting, correct root cause per act, GitOps-correct fixes, avoided destructive commands, hints used. No time pressure scoring.
- Mid-incident snapshot/restore through the progress store

**Acceptance criteria**
- [ ] `AC1` CI expert playthrough completes all four acts deterministically
- [ ] `AC2` A "reckless" playthrough script (`delete` everything, kubectl-only fixes) completes or fails gracefully, and the debrief explains why each action was risky
- [ ] `AC3` Snapshot taken mid-act 3 restores to identical sim/telemetry state

---

## E10-04 · Incident workspace ("the war room")
<!-- meta: milestone=M5; size=L; labels=area:capstone,type:feature; depends=E10-03,E6-09,E7-05,E8-02,E8-04,E8-05 -->

**Scope**
- Multi-pane layout: Terminal, Argo, Pipelines, Dashboards, Explore (logs/traces), Incident notes, Objectives/act narrative
- Panes can be arranged (2-up/3-up presets), maximized, or used as tabs on narrow screens
- Keyboard shortcuts to switch panes (shown in a help dialog); a landmark per pane
- In-world framing: Stormwatch tower at night, storm intensity eases as acts resolve (reduced-motion aware)

**Acceptance criteria**
- [ ] `AC1` Screen reader users can jump between panes via landmarks and shortcuts; each pane has a heading
- [ ] `AC2` Usable at 1280×720 with 2 panes and at 1920×1080 with 3 panes; tab mode below 1024 px
- [ ] `AC3` Pane layout persists across reloads
- [ ] `AC4` Code-split: war room bundle loads only on `/stormwatch`

---

## E10-05 · Debrief and after-action review
<!-- meta: milestone=M5; size=M; labels=area:capstone,type:feature; depends=E10-03 -->

**Scope**
- Timeline of the learner's actions overlaid on the incident timeline
- Per act: root cause, the evidence that pointed to it, what the learner found vs missed, and the expert path
- Strengths and "practice next" recommendations linking back to specific lessons
- Learner's incident note shown alongside an exemplar note
- Completion recorded; "The Long Night" badge appears on the map and in the export code

**Acceptance criteria**
- [ ] `AC1` Debrief is fully readable as linear text (no information only in visuals)
- [ ] `AC2` "Practice next" links resolve to existing lessons (build-time check)
- [ ] `AC3` `manual` Tone review: blameless and encouraging (SME sign-off)
