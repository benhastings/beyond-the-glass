# E7 · GitOps simulation: GitLab CI & Argo CD
<!-- epic: milestone=M4; labels=area:gitops -->

**Goal:** Learners see and practice the whole path from a commit to a running pod, and internalize that **Git is the source of truth**: fix through a merge request, not by hand in the cluster.

**Epic success criteria**
- [ ] `SC1` A learner can follow one change from commit → pipeline → image tag → manifest update → Argo CD sync → new ReplicaSet → healthy pods, and every view agrees at every step
- [ ] `SC2` Drift is demonstrable: a manual `kubectl edit` shows OutOfSync and (with self-heal) gets reverted
- [ ] `SC3` Rollback is practiced two ways (git revert vs `argocd app rollback`), with the trade-offs explained
- [ ] `SC4` Argo CD and pipeline views have full keyboard and screen-reader parity via tree/table alternatives

---

## E7-01 · GitOps model: repos, registry, pipelines and Argo applications
<!-- meta: milestone=M4; size=M; labels=area:gitops,type:feature; depends=E6-01,E6-02 -->

**Scope**
- Virtual Git repos (`ravenpost` app code, `ravenpost-deploy` manifests): commits, branches, MRs, revert
- Image registry with tags produced by pipelines
- Argo CD `Application` model: source (repo/path/revision), destination, sync policy (auto-sync, self-heal, prune), sync status (Synced/OutOfSync/Unknown), health (Healthy/Progressing/Degraded/Missing/Suspended), operation state, history, resource tree
- Reconcile loop on sim clock ticks (default 3 min, configurable per scenario; manual refresh)

**Acceptance criteria**
- [ ] `AC1` Applying a manifest commit through Argo updates cluster state via the E6 controllers (integration test)
- [ ] `AC2` Health is derived from live resources using Argo's real rules for Deployments (Progressing until rollout completes; Degraded on progress deadline exceeded)
- [ ] `AC3` Model is framework-free and snapshot-able

---

## E7-02 · GitLab pipeline view (mock)
<!-- meta: milestone=M4; size=M; labels=area:gitops,type:feature; depends=E7-01,E1-03 -->

**Scope**
- Pipeline graph: stages `build → test → scan → package → update-manifests`, jobs with status icons and durations
- Job log viewer with sections (collapsible), realistic output, and failure states (failed test, failed scan, registry push error, bad tag written to manifest)
- Linked: the commit SHA, image tag produced, and MR it belongs to

**Acceptance criteria**
- [ ] `AC1` Graph has a list/table alternative with identical information
- [ ] `AC2` Job status never conveyed by color alone
- [ ] `AC3` Pipeline outcomes are driven by the scenario timeline (deterministic)

---

## E7-03 · Merge request flow
<!-- meta: milestone=M4; size=M; labels=area:gitops,type:feature; depends=E7-01,E7-02,E6-08 -->

**Scope**
- Learner edits a manifest in the deploy repo (guided YAML editor with inline diff), writes a commit message, opens an MR, sees the pipeline run, merges, and watches Argo pick it up
- Scenario hooks: MR validation can fail (lint, policy) with teachable messages

**Acceptance criteria**
- [ ] `AC1` Full flow completable by keyboard only (Playwright)
- [ ] `AC2` Diff view is a real unified diff with +/- markers announced to screen readers ("added line 14: memory: 512Mi")
- [ ] `AC3` Challenge predicates can assert "fixed via MR" vs "fixed via kubectl"

---

## E7-04 · argocd CLI subset
<!-- meta: milestone=M4; size=M; labels=area:gitops,type:feature; depends=E7-01,E6-04 -->

**Scope:** `argocd app list|get|diff|sync|history|rollback|wait|refresh` with `-o wide|yaml|json` where real argocd supports it; `argocd login` is simulated ("already logged in to argocd.ravenpost.example").

**Acceptance criteria**
- [ ] `AC1` Golden-output tests for each command in Synced/Healthy, OutOfSync, Degraded and sync-failed states
- [ ] `AC2` `app diff` output matches the format of real argocd diff
- [ ] `AC3` Commands registered via the E6-04 registry (no parser changes)

---

## E7-05 · Argo CD UI mock
<!-- meta: milestone=M4; size=L; labels=area:gitops,type:feature; depends=E7-01,E1-03 -->

**Scope**
- Applications list (tiles + list toggle) with sync/health badges
- Application details: resource tree (Application → Deployment → ReplicaSet → Pods; Service → Endpoints), node status icons, click a node for live manifest / desired manifest / diff / events / logs
- Buttons: Refresh, Sync (with options dialog: prune, dry run), History and Rollback
- Visually evokes Argo CD's layout **without copying its branding/logos**

**Acceptance criteria**
- [ ] `AC1` Resource tree implements the WAI-ARIA tree pattern and has a table alternative
- [ ] `AC2` Opening a pod node's logs shows the same lines as `kubectl logs` for that pod (contract test)
- [ ] `AC3` No Argo CD logos or trademarks used beyond nominative text references

---

## E7-06 · Drift, sync failure and rollback scenarios
<!-- meta: milestone=M4; size=M; labels=area:gitops,type:feature; depends=E7-04,E7-05,E6-07 -->

**Scope:** Reusable scenario fragments:
1. Manual `kubectl edit`/`scale` → OutOfSync → self-heal reverts (and the learner sees why their fix "didn't stick")
2. Auto-sync off: merged change waits → learner syncs
3. Sync failed: invalid manifest (e.g., immutable selector change) → read the operation error
4. Bad release → rollback via `git revert` + sync vs `argocd app rollback` (auto-sync must be disabled) with trade-off explanation

**Acceptance criteria**
- [ ] `AC1` Each fragment has an expert-path test proving it's solvable
- [ ] `AC2` The self-heal revert produces a visible event in Argo and `kubectl get events`
- [ ] `AC3` Fragments are composable into the capstone (E10)
